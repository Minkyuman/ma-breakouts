import Decimal from "decimal.js";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashLedger,
  executions,
  fxSnapshots,
  orders,
  portfolios,
  positions,
  priceSnapshots,
  seasons,
  users,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import {
  fetchTradingQuote,
  MarketQuoteError,
  type Market,
  type TradingQuote,
} from "@/lib/market";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const SERIALIZABLE_RETRY_LIMIT = 3;

export type TradeSide = "buy" | "sell";

export type TradeReceipt = {
  replayed: boolean;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  securityName: string;
  market: string;
  side: TradeSide;
  quantity: number;
  tradeNote: string | null;
  status: "filled";
  nativePrice: string;
  nativeCurrency: string;
  fxRate: string;
  grossKrw: string;
  feeKrw: string;
  cashDeltaKrw: string;
  cashBalanceAfterKrw: string;
  quoteSource: string;
  quoteAt: string;
  fxSource: string;
  fxAt: string;
  ruleVersion: number;
  executedAt: string;
  simulation: true;
};

export type PortfolioDashboard = {
  season: { id: string; name: string; endsAt: string };
  portfolio: {
    cashKrw: string;
    equityKrw: string;
    joinedAt: string;
    valuationNote: string;
  };
  holdings: Array<{
    symbol: string;
    securityName: string;
    market: string;
    nativeCurrency: string;
    quantity: number;
    averageCostKrw: string;
    realizedPnlKrw: string;
    lastNativePrice: string;
    lastFxRate: string;
    marketValueKrw: string;
    unrealizedPnlKrw: string;
    lastQuotedAt: string;
  }>;
  orders: TradeReceipt[];
};

export class GameTradeError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ORDER"
      | "NOT_ENROLLED"
      | "NO_ACTIVE_SEASON"
      | "IDEMPOTENCY_CONFLICT"
      | "INSUFFICIENT_CASH"
      | "INSUFFICIENT_SHARES"
      | "CONFLICT_RETRY_EXHAUSTED"
      | "QUOTE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "GameTradeError";
  }
}

function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  const visited = new Set<unknown>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

export function normalizeTradeNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new GameTradeError("INVALID_ORDER", "매매 메모는 텍스트로 입력해 주세요.");
  }
  const note = value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (!note) return null;
  if (Array.from(note).length > 200) {
    throw new GameTradeError("INVALID_ORDER", "매매 메모는 200자 이내로 입력해 주세요.");
  }
  if (/[<>]/u.test(note) || /(?:https?:\/\/|www\.)/iu.test(note) || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u.test(note)) {
    throw new GameTradeError("INVALID_ORDER", "매매 메모에는 HTML, 링크 또는 이메일을 넣을 수 없습니다.");
  }
  return note;
}

function normalizeIntent(input: Record<string, unknown>) {
  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  const market = typeof input.market === "string" ? input.market.trim().toUpperCase() : "";
  const side: TradeSide | null = input.side === "buy" || input.side === "sell" ? input.side : null;
  const quantity = Number(input.quantity);
  const clientOrderId = typeof input.clientOrderId === "string" ? input.clientOrderId.trim() : "";
  const tradeNote = normalizeTradeNote(input.tradeNote);
  const validMarket = ["KOSPI", "KOSDAQ", "NASDAQ", "NYSE", "AMEX"].includes(market);
  const validSymbol = /^\d{6}$/u.test(symbol) || /^[A-Z][A-Z0-9.-]{0,15}$/u.test(symbol);

  if (
    !validSymbol ||
    !validMarket ||
    !side ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 1_000_000 ||
    !/^[A-Za-z0-9:_-]{8,128}$/u.test(clientOrderId)
  ) {
    throw new GameTradeError(
      "INVALID_ORDER",
      "종목, 시장, 매수·매도, 수량 또는 주문 식별자를 확인해 주세요.",
    );
  }

  return { symbol, market: market as Market, side, quantity, clientOrderId, tradeNote };
}

async function activePortfolio(authUser: AuthUser) {
  const database = getDb();
  const now = new Date();
  const [row] = await database
    .select({
      season: seasons,
      portfolio: portfolios,
    })
    .from(users)
    .innerJoin(portfolios, eq(portfolios.userId, users.id))
    .innerJoin(seasons, eq(seasons.id, portfolios.seasonId))
    .where(
      and(
        eq(users.googleSub, authUser.sub),
        eq(seasons.status, "open"),
        lte(seasons.startsAt, now),
        gt(seasons.endsAt, now),
      ),
    )
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  return row;
}

async function receiptByOrderId(orderId: string, replayed: boolean): Promise<TradeReceipt> {
  const database = getDb();
  const [row] = await database
    .select({
      order: orders,
      execution: executions,
      cashBalanceAfterKrw: cashLedger.balanceAfterKrw,
    })
    .from(orders)
    .innerJoin(executions, eq(executions.orderId, orders.id))
    .innerJoin(
      cashLedger,
      and(
        eq(cashLedger.referenceType, "execution"),
        eq(cashLedger.referenceId, executions.id),
      ),
    )
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) throw new Error("체결 영수증을 찾을 수 없습니다.");

  return {
    replayed,
    orderId: row.order.id,
    clientOrderId: row.order.clientOrderId,
    symbol: row.order.symbol,
    securityName: row.order.securityName,
    market: row.order.market,
    side: row.order.side,
    quantity: row.order.quantity,
    tradeNote: row.order.tradeNote,
    status: row.order.status,
    nativePrice: row.execution.nativePrice,
    nativeCurrency: row.execution.nativeCurrency,
    fxRate: row.execution.fxRate,
    grossKrw: row.execution.grossKrw,
    feeKrw: row.execution.feeKrw,
    cashDeltaKrw: row.execution.cashDeltaKrw,
    cashBalanceAfterKrw: row.cashBalanceAfterKrw,
    quoteSource: row.execution.quoteSource,
    quoteAt: row.execution.quoteAt.toISOString(),
    fxSource: row.execution.fxSource,
    fxAt: row.execution.fxAt.toISOString(),
    ruleVersion: row.execution.ruleVersion,
    executedAt: row.execution.createdAt.toISOString(),
    simulation: true,
  };
}

function sameIntent(
  existing: typeof orders.$inferSelect,
  intent: ReturnType<typeof normalizeIntent>,
) {
  return (
    existing.symbol === intent.symbol &&
    existing.market === intent.market &&
    existing.side === intent.side &&
    existing.quantity === intent.quantity &&
    existing.tradeNote === intent.tradeNote
  );
}

export async function executeTrade(
  authUser: AuthUser,
  input: Record<string, unknown>,
  quoteProvider: (symbol: string, market: Market) => Promise<TradingQuote> = fetchTradingQuote,
): Promise<TradeReceipt> {
  const intent = normalizeIntent(input);
  const context = await activePortfolio(authUser);
  if (!context) {
    throw new GameTradeError("NOT_ENROLLED", "먼저 선 넘는 리그에 참가해 주세요.");
  }

  const database = getDb();
  const [priorOrder] = await database
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.portfolioId, context.portfolio.id),
        eq(orders.clientOrderId, intent.clientOrderId),
      ),
    )
    .limit(1);
  if (priorOrder) {
    if (!sameIntent(priorOrder, intent)) {
      throw new GameTradeError(
        "IDEMPOTENCY_CONFLICT",
        "같은 주문 식별자가 다른 주문에 이미 사용되었습니다.",
      );
    }
    return receiptByOrderId(priorOrder.id, true);
  }

  let quote: TradingQuote;
  try {
    quote = await quoteProvider(intent.symbol, intent.market);
  } catch (error) {
    if (error instanceof MarketQuoteError) {
      throw new GameTradeError("QUOTE_UNAVAILABLE", error.message);
    }
    throw error;
  }

  const quoteNow = Date.now();
  const quoteAgeMs = quoteNow - quote.quoteAt.getTime();
  const fxAgeMs = quoteNow - quote.fxAt.getTime();
  const receivedAgeMs = quoteNow - quote.quoteReceivedAt.getTime();
  if (
    quote.ticker.code !== intent.symbol ||
    quote.ticker.market !== intent.market ||
    (quote.ticker.assetType !== "STOCK" && !(
      quote.ticker.assetType === "ETF" && (intent.market === "KOSPI" || intent.market === "KOSDAQ")
    )) ||
    !new Decimal(quote.nativePrice).isPositive() ||
    !new Decimal(quote.fxRate).isPositive() ||
    quoteAgeMs < -36 * 60 * 60 * 1000 ||
    quoteAgeMs > 8 * 24 * 60 * 60 * 1000 ||
    fxAgeMs < -36 * 60 * 60 * 1000 ||
    fxAgeMs > 5 * 24 * 60 * 60 * 1000 ||
    receivedAgeMs < -5 * 60 * 1000 ||
    receivedAgeMs > 5 * 60 * 1000
  ) {
    throw new GameTradeError(
      "QUOTE_UNAVAILABLE",
      "시세 또는 환율이 오래되었거나 주문 종목과 일치하지 않습니다.",
    );
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      const outcome = await database.transaction(
        async (transaction) => {
          const now = new Date();
          const [locked] = await transaction
            .select({ season: seasons, portfolio: portfolios })
            .from(users)
            .innerJoin(portfolios, eq(portfolios.userId, users.id))
            .innerJoin(seasons, eq(seasons.id, portfolios.seasonId))
            .where(
              and(
                eq(users.googleSub, authUser.sub),
                eq(seasons.status, "open"),
                lte(seasons.startsAt, now),
                gt(seasons.endsAt, now),
              ),
            )
            .orderBy(desc(seasons.startsAt))
            .limit(1)
            .for("update", { of: portfolios });
          if (!locked) {
            throw new GameTradeError("NO_ACTIVE_SEASON", "현재 주문 가능한 시즌이 없습니다.");
          }

          const [existingOrder] = await transaction
            .select()
            .from(orders)
            .where(
              and(
                eq(orders.portfolioId, locked.portfolio.id),
                eq(orders.clientOrderId, intent.clientOrderId),
              ),
            )
            .limit(1);
          if (existingOrder) {
            if (!sameIntent(existingOrder, intent)) {
              throw new GameTradeError(
                "IDEMPOTENCY_CONFLICT",
                "같은 주문 식별자가 다른 주문에 이미 사용되었습니다.",
              );
            }
            return { orderId: existingOrder.id, replayed: true };
          }

          const [position] = await transaction
            .select()
            .from(positions)
            .where(
              and(
                eq(positions.portfolioId, locked.portfolio.id),
                eq(positions.symbol, intent.symbol),
                eq(positions.market, intent.market),
              ),
            )
            .limit(1)
            .for("update");

          if (intent.side === "sell" && (!position || position.quantity < intent.quantity)) {
            throw new GameTradeError("INSUFFICIENT_SHARES", "매도할 수량이 보유수량보다 많습니다.");
          }

          const nativePrice = new Decimal(quote.nativePrice);
          const fxRate = new Decimal(quote.fxRate);
          const unitKrw = nativePrice.times(fxRate);
          const grossKrw = unitKrw.times(intent.quantity).toDecimalPlaces(2);
          const cashDeltaKrw = intent.side === "buy" ? grossKrw.negated() : grossKrw;
          const currentCash = new Decimal(locked.portfolio.cashKrw);
          const nextCash = currentCash.plus(cashDeltaKrw).toDecimalPlaces(2);
          if (nextCash.isNegative()) {
            throw new GameTradeError("INSUFFICIENT_CASH", "주문 금액에 비해 보유 현금이 부족합니다.");
          }

          const oldQuantity = position?.quantity ?? 0;
          const nextQuantity = intent.side === "buy"
            ? oldQuantity + intent.quantity
            : oldQuantity - intent.quantity;
          const oldAverageCost = new Decimal(position?.averageCostKrw ?? "0");
          const oldMarketValue = new Decimal(position?.marketValueKrw ?? "0");
          const oldRealizedPnl = new Decimal(position?.realizedPnlKrw ?? "0");
          const nextAverageCost = intent.side === "buy"
            ? oldAverageCost.times(oldQuantity).plus(grossKrw).div(nextQuantity).toDecimalPlaces(6)
            : nextQuantity === 0
              ? new Decimal(0)
              : oldAverageCost;
          const realizedDelta = intent.side === "sell"
            ? unitKrw.minus(oldAverageCost).times(intent.quantity).toDecimalPlaces(2)
            : new Decimal(0);
          const nextRealizedPnl = oldRealizedPnl.plus(realizedDelta).toDecimalPlaces(2);
          const nextMarketValue = unitKrw.times(nextQuantity).toDecimalPlaces(2);
          const nextUnrealizedPnl = unitKrw
            .minus(nextAverageCost)
            .times(nextQuantity)
            .toDecimalPlaces(2);
          const nextEquity = new Decimal(locked.portfolio.equityKrw)
            .plus(cashDeltaKrw)
            .plus(nextMarketValue.minus(oldMarketValue))
            .toDecimalPlaces(2);

          const [order] = await transaction
            .insert(orders)
            .values({
              portfolioId: locked.portfolio.id,
              symbol: intent.symbol,
              securityName: quote.ticker.name,
              market: intent.market,
              side: intent.side,
              quantity: intent.quantity,
              tradeNote: intent.tradeNote,
              clientOrderId: intent.clientOrderId,
              requestedAt: now,
            })
            .returning();

          const [execution] = await transaction
            .insert(executions)
            .values({
              orderId: order.id,
              quantity: intent.quantity,
              nativePrice: nativePrice.toFixed(6),
              nativeCurrency: quote.nativeCurrency,
              fxRate: fxRate.toFixed(8),
              grossKrw: grossKrw.toFixed(2),
              feeKrw: "0.00",
              cashDeltaKrw: cashDeltaKrw.toFixed(2),
              quoteSource: quote.quoteSource,
              quoteAt: quote.quoteAt,
              quoteReceivedAt: quote.quoteReceivedAt,
              fxSource: quote.fxSource,
              fxAt: quote.fxAt,
              fxReceivedAt: quote.fxReceivedAt,
              ruleVersion: locked.season.ruleVersion,
            })
            .returning();

          await transaction
            .insert(priceSnapshots)
            .values({
              symbol: intent.symbol,
              market: intent.market,
              nativeCurrency: quote.nativeCurrency,
              nativePrice: nativePrice.toFixed(6),
              source: quote.quoteSource,
              quotedAt: quote.quoteAt,
              receivedAt: quote.quoteReceivedAt,
            })
            .onConflictDoNothing();
          await transaction
            .insert(fxSnapshots)
            .values({
              baseCurrency: quote.nativeCurrency,
              quoteCurrency: "KRW",
              rate: fxRate.toFixed(8),
              source: quote.fxSource,
              quotedAt: quote.fxAt,
              receivedAt: quote.fxReceivedAt,
            })
            .onConflictDoNothing();

          const positionValues = {
            securityName: quote.ticker.name,
            nativeCurrency: quote.nativeCurrency,
            quantity: nextQuantity,
            averageCostKrw: nextAverageCost.toFixed(6),
            realizedPnlKrw: nextRealizedPnl.toFixed(2),
            lastNativePrice: nativePrice.toFixed(6),
            lastFxRate: fxRate.toFixed(8),
            marketValueKrw: nextMarketValue.toFixed(2),
            unrealizedPnlKrw: nextUnrealizedPnl.toFixed(2),
            lastQuotedAt: quote.quoteAt,
            updatedAt: now,
          };
          if (position) {
            await transaction
              .update(positions)
              .set({ ...positionValues, version: sql`${positions.version} + 1` })
              .where(eq(positions.id, position.id));
          } else {
            await transaction.insert(positions).values({
              portfolioId: locked.portfolio.id,
              symbol: intent.symbol,
              market: intent.market,
              ...positionValues,
            });
          }

          await transaction
            .update(portfolios)
            .set({
              cashKrw: nextCash.toFixed(2),
              equityKrw: nextEquity.toFixed(2),
              version: sql`${portfolios.version} + 1`,
              updatedAt: now,
            })
            .where(eq(portfolios.id, locked.portfolio.id));

          await transaction.insert(cashLedger).values({
            portfolioId: locked.portfolio.id,
            entryType: "trade_settlement",
            amountKrw: cashDeltaKrw.toFixed(2),
            balanceAfterKrw: nextCash.toFixed(2),
            idempotencyKey: `order:${order.id}`,
            referenceType: "execution",
            referenceId: execution.id,
            note: `${quote.ticker.name} ${intent.side === "buy" ? "모의 매수" : "모의 매도"} ${intent.quantity}주`,
          });

          return { orderId: order.id, replayed: false };
        },
        { isolationLevel: "serializable", accessMode: "read write" },
      );

      return receiptByOrderId(outcome.orderId, outcome.replayed);
    } catch (error) {
      if (error instanceof GameTradeError) throw error;
      const code = databaseErrorCode(error);
      if (code === "40001" && attempt < SERIALIZABLE_RETRY_LIMIT) continue;
      if (code === "40001") {
        throw new GameTradeError(
          "CONFLICT_RETRY_EXHAUSTED",
          "동시에 주문이 몰렸습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw error;
    }
  }

  throw new GameTradeError(
    "CONFLICT_RETRY_EXHAUSTED",
    "동시에 주문이 몰렸습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export async function getPortfolioDashboard(authUser: AuthUser): Promise<PortfolioDashboard> {
  const context = await activePortfolio(authUser);
  if (!context) {
    throw new GameTradeError("NOT_ENROLLED", "먼저 선 넘는 리그에 참가해 주세요.");
  }
  const database = getDb();
  const [holdingRows, orderRows] = await Promise.all([
    database
      .select()
      .from(positions)
      .where(and(eq(positions.portfolioId, context.portfolio.id), gt(positions.quantity, 0)))
      .orderBy(desc(positions.marketValueKrw)),
    database
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.portfolioId, context.portfolio.id))
      .orderBy(desc(orders.createdAt))
      .limit(30),
  ]);
  const receipts = await Promise.all(orderRows.map((order) => receiptByOrderId(order.id, false)));

  return {
    season: {
      id: context.season.id,
      name: context.season.name,
      endsAt: context.season.endsAt.toISOString(),
    },
    portfolio: {
      cashKrw: context.portfolio.cashKrw,
      equityKrw: context.portfolio.equityKrw,
      joinedAt: context.portfolio.joinedAt.toISOString(),
      valuationNote: "최근 모의 체결 또는 리그 평가 시세 기준",
    },
    holdings: holdingRows.map((position) => ({
      symbol: position.symbol,
      securityName: position.securityName,
      market: position.market,
      nativeCurrency: position.nativeCurrency,
      quantity: position.quantity,
      averageCostKrw: position.averageCostKrw,
      realizedPnlKrw: position.realizedPnlKrw,
      lastNativePrice: position.lastNativePrice,
      lastFxRate: position.lastFxRate,
      marketValueKrw: position.marketValueKrw,
      unrealizedPnlKrw: position.unrealizedPnlKrw,
      lastQuotedAt: position.lastQuotedAt.toISOString(),
    })),
    orders: receipts,
  };
}
