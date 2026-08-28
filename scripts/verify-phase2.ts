import assert from "node:assert/strict";

import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";

import { closeDb, getDb } from "../db/index";
import {
  cashLedger,
  executions,
  fxSnapshots,
  gameProfiles,
  orders,
  portfolios,
  positions,
  priceSnapshots,
  users,
} from "../db/schema";
import { enrollInActiveSeason } from "../lib/game";
import { executeTrade, GameTradeError, getPortfolioDashboard } from "../lib/game-trading";
import type { Market, TradingQuote } from "../lib/market";

if (process.env.ALLOW_PHASE2_DB_TEST !== "true") {
  throw new Error("DB 통합 검증은 ALLOW_PHASE2_DB_TEST=true일 때만 실행할 수 있습니다.");
}

const suffix = Date.now().toString(36);
const googleSub = `phase2-test-${suffix}`;
const nickname = `거래_${suffix}`.slice(0, 16);
const sourcePrefix = `phase2-test-${suffix}`;
const database = getDb();
const now = new Date();

const authUser = {
  sub: googleSub,
  email: `${googleSub}@example.invalid`,
  name: "Phase 2 검증 사용자",
  exp: Math.floor(Date.now() / 1000) + 600,
};

function quote(
  symbol: string,
  market: Market,
  nativePrice: string,
  nativeCurrency: "KRW" | "USD" = "KRW",
  fxRate = "1.00000000",
): TradingQuote {
  return {
    ticker: {
      code: symbol,
      name: symbol === "TESTKR" ? "검증한국" : "검증미국",
      market,
      assetType: "STOCK",
      marketCap: 1,
      price: Number(nativePrice),
      currency: nativeCurrency,
    },
    nativePrice,
    nativeCurrency,
    quoteSource: `${sourcePrefix}-price`,
    quoteAt: now,
    quoteReceivedAt: new Date(),
    fxRate,
    fxSource: `${sourcePrefix}-fx`,
    fxAt: now,
    fxReceivedAt: new Date(),
  };
}

try {
  await enrollInActiveSeason(authUser, {
    nickname,
    acceptedRules: true,
    activityFeedVisible: true,
  });

  const krQuote = async () => quote("TESTKR", "KOSPI", "60000000");
  const simultaneousBuys = await Promise.allSettled([
    executeTrade(authUser, { symbol: "TESTKR", market: "KOSPI", side: "buy", quantity: 1, clientOrderId: `${suffix}-buy-a` }, krQuote),
    executeTrade(authUser, { symbol: "TESTKR", market: "KOSPI", side: "buy", quantity: 1, clientOrderId: `${suffix}-buy-b` }, krQuote),
  ]);
  const successfulBuy = simultaneousBuys.find((result) => result.status === "fulfilled");
  const rejectedBuy = simultaneousBuys.find((result) => result.status === "rejected");
  assert(successfulBuy && successfulBuy.status === "fulfilled", "동시 매수 중 한 건은 체결되어야 합니다.");
  assert(rejectedBuy && rejectedBuy.status === "rejected", "현금을 초과한 두 번째 매수는 거절되어야 합니다.");
  assert(rejectedBuy.reason instanceof GameTradeError);
  assert.equal(rejectedBuy.reason.code, "INSUFFICIENT_CASH");

  const replay = await executeTrade(
    authUser,
    {
      symbol: successfulBuy.value.symbol,
      market: successfulBuy.value.market,
      side: successfulBuy.value.side,
      quantity: successfulBuy.value.quantity,
      clientOrderId: successfulBuy.value.clientOrderId,
    },
    krQuote,
  );
  assert.equal(replay.replayed, true, "같은 주문 키는 기존 영수증을 반환해야 합니다.");
  assert.equal(replay.orderId, successfulBuy.value.orderId);

  const simultaneousSells = await Promise.allSettled([
    executeTrade(authUser, { symbol: "TESTKR", market: "KOSPI", side: "sell", quantity: 1, clientOrderId: `${suffix}-sell-a` }, krQuote),
    executeTrade(authUser, { symbol: "TESTKR", market: "KOSPI", side: "sell", quantity: 1, clientOrderId: `${suffix}-sell-b` }, krQuote),
  ]);
  const rejectedSell = simultaneousSells.find((result) => result.status === "rejected");
  assert(rejectedSell && rejectedSell.status === "rejected");
  assert(rejectedSell.reason instanceof GameTradeError);
  assert.equal(rejectedSell.reason.code, "INSUFFICIENT_SHARES");

  const usdQuote = async () => quote("TESTUS", "NASDAQ", "10.25", "USD", "1400.00000000");
  const usdReceipt = await executeTrade(
    authUser,
    { symbol: "TESTUS", market: "NASDAQ", side: "buy", quantity: 2, clientOrderId: `${suffix}-usd-buy` },
    usdQuote,
  );
  assert.equal(usdReceipt.grossKrw, "28700.00");
  assert.equal(usdReceipt.fxRate, "1400.00000000");

  await assert.rejects(
    executeTrade(
      authUser,
      { symbol: "STALE", market: "NASDAQ", side: "buy", quantity: 1, clientOrderId: `${suffix}-stale` },
      async () => ({ ...quote("STALE", "NASDAQ", "1", "USD", "1400"), quoteAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) }),
    ),
    (error) => error instanceof GameTradeError && error.code === "QUOTE_UNAVAILABLE",
  );

  const [account] = await database.select({ id: users.id }).from(users).where(eq(users.googleSub, googleSub));
  const [portfolio] = await database.select().from(portfolios).where(eq(portfolios.userId, account.id));
  const allLedger = await database.select().from(cashLedger).where(eq(cashLedger.portfolioId, portfolio.id));
  const ledgerBalance = allLedger.reduce((sum, entry) => sum.plus(entry.amountKrw), new Decimal(0));
  assert.equal(ledgerBalance.toFixed(2), portfolio.cashKrw, "현금 원장 합계와 포트폴리오 현금이 일치해야 합니다.");

  const createdOrders = await database.select().from(orders).where(eq(orders.portfolioId, portfolio.id));
  const createdExecutions = await database
    .select()
    .from(executions)
    .where(and(eq(executions.ruleVersion, 1), eq(executions.orderId, usdReceipt.orderId)));
  assert.equal(createdOrders.length, 3, "매수·매도·미국 매수 세 건만 저장되어야 합니다.");
  assert.equal(createdExecutions.length, 1);

  const dashboard = await getPortfolioDashboard(authUser);
  assert.equal(dashboard.holdings.length, 1);
  assert.equal(dashboard.holdings[0].symbol, "TESTUS");
  assert.equal(dashboard.holdings[0].quantity, 2);
  assert.equal(dashboard.orders.length, 3);
  assert(!JSON.stringify(dashboard).includes(authUser.email));

  console.log("Phase 2 검증 완료: 초과매수·초과매도·재전송·오래된 시세가 차단되고 원장과 현금이 일치합니다.");
} finally {
  const [account] = await database.select({ id: users.id }).from(users).where(eq(users.googleSub, googleSub)).limit(1);
  if (account) {
    const testPortfolios = await database.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.userId, account.id));
    for (const portfolio of testPortfolios) {
      const testOrders = await database.select({ id: orders.id }).from(orders).where(eq(orders.portfolioId, portfolio.id));
      for (const order of testOrders) {
        await database.delete(executions).where(eq(executions.orderId, order.id));
      }
      await database.delete(cashLedger).where(eq(cashLedger.portfolioId, portfolio.id));
      await database.delete(positions).where(eq(positions.portfolioId, portfolio.id));
      await database.delete(orders).where(eq(orders.portfolioId, portfolio.id));
      await database.delete(portfolios).where(eq(portfolios.id, portfolio.id));
    }
    await database.delete(gameProfiles).where(eq(gameProfiles.userId, account.id));
    await database.delete(users).where(eq(users.id, account.id));
  }
  await database.delete(priceSnapshots).where(eq(priceSnapshots.source, `${sourcePrefix}-price`));
  await database.delete(fxSnapshots).where(eq(fxSnapshots.source, `${sourcePrefix}-fx`));
  await closeDb();
}
