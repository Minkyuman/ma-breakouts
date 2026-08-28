import Decimal from "decimal.js";
import { and, desc, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  executions,
  fxSnapshots,
  gameProfiles,
  leaderboardSnapshots,
  orders,
  portfolios,
  positions,
  priceSnapshots,
  seasons,
  users,
} from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import { fetchTradingQuote, type Market, type TradingQuote } from "@/lib/market";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const MAX_QUOTE_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_FX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_RECEIVED_AGE_MS = 5 * 60 * 1000;
const SERIALIZABLE_RETRY_LIMIT = 3;

type QuoteProvider = (symbol: string, market: Market) => Promise<TradingQuote>;

export type LeagueHolding = {
  symbol: string;
  securityName: string;
  market: string;
  nativeCurrency: string;
  quantity: number;
  averageCostKrw: string;
  marketValueKrw: string;
  unrealizedPnlKrw: string;
  lastNativePrice: string;
  lastFxRate: string;
  lastQuotedAt: string;
};

export type LeagueParticipant = {
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  rank: number;
  rankMovement: number | null;
  equityKrw: string;
  cashKrw: string;
  totalReturnPct: string;
  cashRatioPct: string;
  maxDrawdownPct: string;
  topHoldings: Array<Pick<LeagueHolding, "symbol" | "securityName" | "market" | "marketValueKrw">>;
  badges: string[];
  isMe: boolean;
};

export type LeagueActivity = {
  id: string;
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  side: "buy" | "sell";
  symbol: string;
  securityName: string;
  market: string;
  quantity: number;
  tradeNote: string | null;
  grossKrw: string;
  executedAt: string;
};

export type LeagueOverview = {
  season: { id: string; name: string; endsAt: string; initialCashKrw: string };
  snapshot: null | { key: string; valuationAt: string; oldestQuoteAt: string | null };
  participants: LeagueParticipant[];
  activity: LeagueActivity[];
};

export type PublicPlayerDetail = {
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  rank: number;
  equityKrw: string;
  cashKrw: string;
  totalReturnPct: string;
  cashRatioPct: string;
  badges: string[];
  holdings: LeagueHolding[];
  recentTrades: LeagueActivity[];
  activityHidden: boolean;
};

export class LeagueError extends Error {
  constructor(
    public readonly code:
      | "NOT_ENROLLED"
      | "NO_ACTIVE_SEASON"
      | "NO_SNAPSHOT"
      | "PLAYER_NOT_FOUND"
      | "VALUATION_CONFLICT"
      | "QUOTE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "LeagueError";
  }
}

async function activeMembership(authUser: AuthUser) {
  const now = new Date();
  const [row] = await getDb()
    .select({ season: seasons, portfolio: portfolios, user: users, profile: gameProfiles })
    .from(users)
    .innerJoin(gameProfiles, eq(gameProfiles.userId, users.id))
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
  if (!row) throw new LeagueError("NOT_ENROLLED", "먼저 선 넘는 리그에 참가해 주세요.");
  return row;
}

function quoteKey(symbol: string, market: string) {
  return `${market}:${symbol}`;
}

function assertValuationQuote(quote: TradingQuote, symbol: string, market: string, now: Date) {
  const quoteAge = now.getTime() - quote.quoteAt.getTime();
  const fxAge = now.getTime() - quote.fxAt.getTime();
  const receivedAge = now.getTime() - quote.quoteReceivedAt.getTime();
  const fxReceivedAge = now.getTime() - quote.fxReceivedAt.getTime();
  if (
    quote.ticker.code !== symbol ||
    quote.ticker.market !== market ||
    quote.ticker.assetType !== "STOCK" ||
    !new Decimal(quote.nativePrice).isPositive() ||
    !new Decimal(quote.fxRate).isPositive() ||
    quoteAge < -36 * 60 * 60 * 1000 ||
    quoteAge > MAX_QUOTE_AGE_MS ||
    fxAge < -36 * 60 * 60 * 1000 ||
    fxAge > MAX_FX_AGE_MS ||
    receivedAge < -MAX_RECEIVED_AGE_MS ||
    receivedAge > MAX_RECEIVED_AGE_MS ||
    fxReceivedAge < -MAX_RECEIVED_AGE_MS ||
    fxReceivedAge > MAX_RECEIVED_AGE_MS
  ) {
    throw new LeagueError("QUOTE_UNAVAILABLE", `${symbol}의 평가 시세 또는 환율이 오래되었거나 일치하지 않습니다.`);
  }
}

function sameProjection(
  before: Array<typeof positions.$inferSelect>,
  locked: Array<typeof positions.$inferSelect>,
) {
  if (before.length !== locked.length) return false;
  const expected = new Map(before.map((row) => [row.id, `${row.version}:${row.quantity}`]));
  return locked.every((row) => expected.get(row.id) === `${row.version}:${row.quantity}`);
}

export async function refreshLeagueValuation(
  authUser: AuthUser,
  quoteProvider: QuoteProvider = fetchTradingQuote,
): Promise<LeagueOverview> {
  const requester = await activeMembership(authUser);
  const database = getDb();

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    const participantRows = await database
      .select({ portfolio: portfolios })
      .from(portfolios)
      .where(eq(portfolios.seasonId, requester.season.id));
    const portfolioIds = participantRows.map((row) => row.portfolio.id);
    const positionRows = portfolioIds.length
      ? await database
          .select()
          .from(positions)
          .where(and(inArray(positions.portfolioId, portfolioIds), gt(positions.quantity, 0)))
      : [];
    const uniqueSecurities = new Map(
      positionRows.map((position) => [
        quoteKey(position.symbol, position.market),
        { symbol: position.symbol, market: position.market as Market },
      ]),
    );
    const valuationAt = new Date();
    const quoteEntries = await Promise.all(
      [...uniqueSecurities.values()].map(async ({ symbol, market }) => {
        try {
          const quote = await quoteProvider(symbol, market);
          assertValuationQuote(quote, symbol, market, valuationAt);
          return [quoteKey(symbol, market), quote] as const;
        } catch (error) {
          if (error instanceof LeagueError) throw error;
          throw new LeagueError("QUOTE_UNAVAILABLE", `${symbol} 평가 시세를 불러오지 못했습니다.`);
        }
      }),
    );
    const quoteMap = new Map(quoteEntries);

    try {
      await database.transaction(
        async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`leaderboard:${requester.season.id}`}))`,
          );
          const lockedPortfolios = await transaction
            .select()
            .from(portfolios)
            .where(eq(portfolios.seasonId, requester.season.id))
            .orderBy(portfolios.joinedAt)
            .for("update");
          const expectedVersions = new Map(
            participantRows.map(({ portfolio }) => [portfolio.id, portfolio.version]),
          );
          if (
            lockedPortfolios.length !== participantRows.length ||
            lockedPortfolios.some((portfolio) => expectedVersions.get(portfolio.id) !== portfolio.version)
          ) {
            throw new LeagueError("VALUATION_CONFLICT", "평가 중 주문이 체결되어 다시 계산합니다.");
          }
          const lockedPositions = portfolioIds.length
            ? await transaction
                .select()
                .from(positions)
                .where(and(inArray(positions.portfolioId, portfolioIds), gt(positions.quantity, 0)))
                .for("update")
            : [];
          if (!sameProjection(positionRows, lockedPositions)) {
            throw new LeagueError("VALUATION_CONFLICT", "평가 중 보유수량이 변경되어 다시 계산합니다.");
          }

          const historicalRows = await transaction
            .select({
              portfolioId: leaderboardSnapshots.portfolioId,
              equityKrw: leaderboardSnapshots.equityKrw,
              maxDrawdownPct: leaderboardSnapshots.maxDrawdownPct,
            })
            .from(leaderboardSnapshots)
            .where(eq(leaderboardSnapshots.seasonId, requester.season.id));
          const historicalPeaks = new Map<string, Decimal>();
          const historicalMaxDrawdowns = new Map<string, Decimal>();
          for (const row of historicalRows) {
            const equity = new Decimal(row.equityKrw);
            if (!historicalPeaks.has(row.portfolioId) || equity.gt(historicalPeaks.get(row.portfolioId)!)) {
              historicalPeaks.set(row.portfolioId, equity);
            }
            const drawdown = new Decimal(row.maxDrawdownPct);
            if (!historicalMaxDrawdowns.has(row.portfolioId) || drawdown.gt(historicalMaxDrawdowns.get(row.portfolioId)!)) {
              historicalMaxDrawdowns.set(row.portfolioId, drawdown);
            }
          }

          const positionsByPortfolio = new Map<string, Array<typeof positions.$inferSelect>>();
          for (const position of lockedPositions) {
            const rows = positionsByPortfolio.get(position.portfolioId) ?? [];
            rows.push(position);
            positionsByPortfolio.set(position.portfolioId, rows);
          }

          const valuations = lockedPortfolios.map((portfolio) => {
            const holdings = positionsByPortfolio.get(portfolio.id) ?? [];
            let marketValue = new Decimal(0);
            let oldestQuoteAt: Date | null = null;
            for (const position of holdings) {
              const quote = quoteMap.get(quoteKey(position.symbol, position.market));
              if (!quote) throw new LeagueError("QUOTE_UNAVAILABLE", `${position.symbol} 평가 시세가 누락되었습니다.`);
              const value = new Decimal(quote.nativePrice)
                .times(quote.fxRate)
                .times(position.quantity)
                .toDecimalPlaces(2);
              marketValue = marketValue.plus(value);
              for (const timestamp of [quote.quoteAt, quote.fxAt]) {
                if (!oldestQuoteAt || timestamp < oldestQuoteAt) oldestQuoteAt = timestamp;
              }
            }
            const cash = new Decimal(portfolio.cashKrw);
            const equity = cash.plus(marketValue).toDecimalPlaces(2);
            const initialCash = new Decimal(requester.season.initialCashKrw);
            const totalReturnPct = equity.minus(initialCash).div(initialCash).times(100).toDecimalPlaces(6);
            const cashRatioPct = equity.isZero()
              ? new Decimal(0)
              : cash.div(equity).times(100).toDecimalPlaces(6);
            const previousPeak = historicalPeaks.get(portfolio.id) ?? initialCash;
            const peak = Decimal.max(previousPeak, equity);
            const currentDrawdownPct = peak.isZero()
              ? new Decimal(0)
              : peak.minus(equity).div(peak).times(100).toDecimalPlaces(6);
            const maxDrawdownPct = Decimal.max(
              historicalMaxDrawdowns.get(portfolio.id) ?? new Decimal(0),
              currentDrawdownPct,
            ).toDecimalPlaces(6);
            return { portfolio, holdings, cash, marketValue, equity, totalReturnPct, cashRatioPct, maxDrawdownPct, oldestQuoteAt };
          });
          valuations.sort((left, right) => {
            const equityOrder = right.equity.comparedTo(left.equity);
            if (equityOrder !== 0) return equityOrder;
            const drawdownOrder = left.maxDrawdownPct.comparedTo(right.maxDrawdownPct);
            if (drawdownOrder !== 0) return drawdownOrder;
            return left.portfolio.joinedAt.getTime() - right.portfolio.joinedAt.getTime();
          });

          const snapshotKey = crypto.randomUUID();
          for (const [index, valuation] of valuations.entries()) {
            for (const position of valuation.holdings) {
              const quote = quoteMap.get(quoteKey(position.symbol, position.market))!;
              const unitKrw = new Decimal(quote.nativePrice).times(quote.fxRate);
              const marketValue = unitKrw.times(position.quantity).toDecimalPlaces(2);
              const unrealized = unitKrw
                .minus(position.averageCostKrw)
                .times(position.quantity)
                .toDecimalPlaces(2);
              await transaction
                .update(positions)
                .set({
                  lastNativePrice: new Decimal(quote.nativePrice).toFixed(6),
                  lastFxRate: new Decimal(quote.fxRate).toFixed(8),
                  marketValueKrw: marketValue.toFixed(2),
                  unrealizedPnlKrw: unrealized.toFixed(2),
                  lastQuotedAt: quote.quoteAt,
                  version: sql`${positions.version} + 1`,
                  updatedAt: valuationAt,
                })
                .where(eq(positions.id, position.id));
            }
            await transaction
              .update(portfolios)
              .set({
                equityKrw: valuation.equity.toFixed(2),
                version: sql`${portfolios.version} + 1`,
                updatedAt: valuationAt,
              })
              .where(eq(portfolios.id, valuation.portfolio.id));
            await transaction.insert(leaderboardSnapshots).values({
              snapshotKey,
              seasonId: requester.season.id,
              portfolioId: valuation.portfolio.id,
              rank: index + 1,
              equityKrw: valuation.equity.toFixed(2),
              cashKrw: valuation.cash.toFixed(2),
              marketValueKrw: valuation.marketValue.toFixed(2),
              totalReturnPct: valuation.totalReturnPct.toFixed(6),
              cashRatioPct: valuation.cashRatioPct.toFixed(6),
              maxDrawdownPct: valuation.maxDrawdownPct.toFixed(6),
              valuationAt,
              oldestQuoteAt: valuation.oldestQuoteAt,
              createdAt: valuationAt,
            });
          }
          for (const quote of quoteMap.values()) {
            await transaction.insert(priceSnapshots).values({
              symbol: quote.ticker.code,
              market: quote.ticker.market,
              nativeCurrency: quote.nativeCurrency,
              nativePrice: new Decimal(quote.nativePrice).toFixed(6),
              source: quote.quoteSource,
              quotedAt: quote.quoteAt,
              receivedAt: quote.quoteReceivedAt,
            }).onConflictDoNothing();
            await transaction.insert(fxSnapshots).values({
              baseCurrency: quote.nativeCurrency,
              quoteCurrency: "KRW",
              rate: new Decimal(quote.fxRate).toFixed(8),
              source: quote.fxSource,
              quotedAt: quote.fxAt,
              receivedAt: quote.fxReceivedAt,
            }).onConflictDoNothing();
          }
        },
        { isolationLevel: "serializable", accessMode: "read write" },
      );
      return getLeagueOverview(authUser);
    } catch (error) {
      if (error instanceof LeagueError && error.code === "VALUATION_CONFLICT" && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }
      if (error instanceof LeagueError) throw error;
      throw error;
    }
  }
  throw new LeagueError("VALUATION_CONFLICT", "주문과 평가가 겹쳤습니다. 잠시 후 다시 시도해 주세요.");
}

async function latestSnapshotKeys(seasonId: string) {
  const database = getDb();
  const [latest] = await database
    .select({ snapshotKey: leaderboardSnapshots.snapshotKey, createdAt: leaderboardSnapshots.createdAt })
    .from(leaderboardSnapshots)
    .where(eq(leaderboardSnapshots.seasonId, seasonId))
    .orderBy(desc(leaderboardSnapshots.createdAt))
    .limit(1);
  if (!latest) return { latest: null, previousKey: null };
  const [previous] = await database
    .select({ snapshotKey: leaderboardSnapshots.snapshotKey })
    .from(leaderboardSnapshots)
    .where(and(eq(leaderboardSnapshots.seasonId, seasonId), lt(leaderboardSnapshots.createdAt, latest.createdAt)))
    .orderBy(desc(leaderboardSnapshots.createdAt))
    .limit(1);
  return { latest, previousKey: previous?.snapshotKey ?? null };
}

async function leagueActivity(seasonId: string, limit = 30): Promise<LeagueActivity[]> {
  const rows = await getDb()
    .select({
      id: executions.id,
      profileId: gameProfiles.id,
      nickname: gameProfiles.nickname,
      avatarUrl: users.avatarUrl,
      side: orders.side,
      symbol: orders.symbol,
      securityName: orders.securityName,
      market: orders.market,
      quantity: orders.quantity,
      tradeNote: orders.tradeNote,
      grossKrw: executions.grossKrw,
      executedAt: executions.createdAt,
    })
    .from(executions)
    .innerJoin(orders, eq(orders.id, executions.orderId))
    .innerJoin(portfolios, eq(portfolios.id, orders.portfolioId))
    .innerJoin(users, eq(users.id, portfolios.userId))
    .innerJoin(gameProfiles, eq(gameProfiles.userId, users.id))
    .where(and(eq(portfolios.seasonId, seasonId), eq(gameProfiles.activityFeedVisible, true)))
    .orderBy(desc(executions.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, executedAt: row.executedAt.toISOString() }));
}

export async function getLeagueOverview(authUser: AuthUser): Promise<LeagueOverview> {
  const requester = await activeMembership(authUser);
  const database = getDb();
  const { latest, previousKey } = await latestSnapshotKeys(requester.season.id);
  if (!latest) {
    return {
      season: { id: requester.season.id, name: requester.season.name, endsAt: requester.season.endsAt.toISOString(), initialCashKrw: requester.season.initialCashKrw },
      snapshot: null,
      participants: [],
      activity: await leagueActivity(requester.season.id),
    };
  }
  const snapshotRows = await database
    .select({ snapshot: leaderboardSnapshots, portfolio: portfolios, profile: gameProfiles, user: users })
    .from(leaderboardSnapshots)
    .innerJoin(portfolios, eq(portfolios.id, leaderboardSnapshots.portfolioId))
    .innerJoin(users, eq(users.id, portfolios.userId))
    .innerJoin(gameProfiles, eq(gameProfiles.userId, users.id))
    .where(eq(leaderboardSnapshots.snapshotKey, latest.snapshotKey))
    .orderBy(leaderboardSnapshots.rank);
  const portfolioIds = snapshotRows.map((row) => row.portfolio.id);
  const [holdingRows, orderRows, previousRows, activity] = await Promise.all([
    portfolioIds.length
      ? database.select().from(positions).where(and(inArray(positions.portfolioId, portfolioIds), gt(positions.quantity, 0))).orderBy(desc(positions.marketValueKrw))
      : [],
    portfolioIds.length
      ? database.select({ portfolioId: orders.portfolioId, id: orders.id }).from(orders).where(inArray(orders.portfolioId, portfolioIds))
      : [],
    previousKey
      ? database.select({ portfolioId: leaderboardSnapshots.portfolioId, rank: leaderboardSnapshots.rank }).from(leaderboardSnapshots).where(eq(leaderboardSnapshots.snapshotKey, previousKey))
      : [],
    leagueActivity(requester.season.id),
  ]);
  const holdingsByPortfolio = new Map<string, typeof holdingRows>();
  for (const holding of holdingRows) {
    const rows = holdingsByPortfolio.get(holding.portfolioId) ?? [];
    rows.push(holding);
    holdingsByPortfolio.set(holding.portfolioId, rows);
  }
  const orderCounts = new Map<string, number>();
  for (const order of orderRows) orderCounts.set(order.portfolioId, (orderCounts.get(order.portfolioId) ?? 0) + 1);
  const priorRanks = new Map(previousRows.map((row) => [row.portfolioId, row.rank]));
  const participants = snapshotRows.map(({ snapshot, portfolio, profile, user }) => {
    const holdings = holdingsByPortfolio.get(portfolio.id) ?? [];
    const badges: string[] = [];
    if ((orderCounts.get(portfolio.id) ?? 0) > 0) badges.push("첫 돌파");
    if (holdings.length >= 10) badges.push("10종목 탐험가");
    if (new Decimal(snapshot.cashRatioPct).gte(90)) badges.push("현금왕");
    if (snapshot.rank <= 3) badges.push(["🥇 선두", "🥈 추격", "🥉 포디움"][snapshot.rank - 1]);
    const previousRank = priorRanks.get(portfolio.id);
    return {
      profileId: profile.id,
      nickname: profile.nickname,
      avatarUrl: user.avatarUrl,
      rank: snapshot.rank,
      rankMovement: previousRank === undefined ? null : previousRank - snapshot.rank,
      equityKrw: snapshot.equityKrw,
      cashKrw: snapshot.cashKrw,
      totalReturnPct: snapshot.totalReturnPct,
      cashRatioPct: snapshot.cashRatioPct,
      maxDrawdownPct: snapshot.maxDrawdownPct,
      topHoldings: holdings.slice(0, 3).map((holding) => ({
        symbol: holding.symbol,
        securityName: holding.securityName,
        market: holding.market,
        marketValueKrw: holding.marketValueKrw,
      })),
      badges,
      isMe: portfolio.id === requester.portfolio.id,
    };
  });
  const oldestQuoteAt = snapshotRows.reduce<Date | null>((oldest, row) => {
    const candidate = row.snapshot.oldestQuoteAt;
    return candidate && (!oldest || candidate < oldest) ? candidate : oldest;
  }, null);
  return {
    season: { id: requester.season.id, name: requester.season.name, endsAt: requester.season.endsAt.toISOString(), initialCashKrw: requester.season.initialCashKrw },
    snapshot: { key: latest.snapshotKey, valuationAt: latest.createdAt.toISOString(), oldestQuoteAt: oldestQuoteAt?.toISOString() ?? null },
    participants,
    activity,
  };
}

export async function getPublicPlayerDetail(authUser: AuthUser, profileId: string): Promise<PublicPlayerDetail> {
  const overview = await getLeagueOverview(authUser);
  const participant = overview.participants.find((row) => row.profileId === profileId);
  if (!participant) throw new LeagueError("PLAYER_NOT_FOUND", "해당 참가자를 찾을 수 없습니다.");
  const requester = await activeMembership(authUser);
  const [target] = await getDb()
    .select({ portfolio: portfolios, profile: gameProfiles, user: users })
    .from(gameProfiles)
    .innerJoin(users, eq(users.id, gameProfiles.userId))
    .innerJoin(portfolios, eq(portfolios.userId, users.id))
    .where(and(eq(gameProfiles.id, profileId), eq(portfolios.seasonId, requester.season.id)))
    .limit(1);
  if (!target) throw new LeagueError("PLAYER_NOT_FOUND", "해당 참가자를 찾을 수 없습니다.");
  const holdingRows = await getDb()
    .select()
    .from(positions)
    .where(and(eq(positions.portfolioId, target.portfolio.id), gt(positions.quantity, 0)))
    .orderBy(desc(positions.marketValueKrw));
  const activity = target.profile.activityFeedVisible
    ? (await leagueActivity(requester.season.id, 100)).filter((row) => row.profileId === profileId).slice(0, 10)
    : [];
  return {
    profileId,
    nickname: participant.nickname,
    avatarUrl: target.user.avatarUrl,
    rank: participant.rank,
    equityKrw: participant.equityKrw,
    cashKrw: participant.cashKrw,
    totalReturnPct: participant.totalReturnPct,
    cashRatioPct: participant.cashRatioPct,
    badges: participant.badges,
    holdings: holdingRows.map((holding) => ({
      symbol: holding.symbol,
      securityName: holding.securityName,
      market: holding.market,
      nativeCurrency: holding.nativeCurrency,
      quantity: holding.quantity,
      averageCostKrw: holding.averageCostKrw,
      marketValueKrw: holding.marketValueKrw,
      unrealizedPnlKrw: holding.unrealizedPnlKrw,
      lastNativePrice: holding.lastNativePrice,
      lastFxRate: holding.lastFxRate,
      lastQuotedAt: holding.lastQuotedAt.toISOString(),
    })),
    recentTrades: activity,
    activityHidden: !target.profile.activityFeedVisible,
  };
}
