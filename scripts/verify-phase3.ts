import assert from "node:assert/strict";

import Decimal from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";

import { closeDb, getDb } from "../db/index";
import {
  cashLedger,
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
} from "../db/schema";
import { enrollInActiveSeason } from "../lib/game";
import { executeTrade } from "../lib/game-trading";
import { getPublicPlayerDetail, refreshLeagueValuation } from "../lib/game-league";
import type { AuthUser } from "../lib/auth";
import type { Market, TradingQuote } from "../lib/market";

if (process.env.ALLOW_PHASE3_DB_TEST !== "true") {
  throw new Error("DB 통합 검증은 ALLOW_PHASE3_DB_TEST=true일 때만 실행할 수 있습니다.");
}

const suffix = Date.now().toString(36);
const database = getDb();
const now = new Date();
const sourcePrefix = `phase3-test-${suffix}`;
const seasonSlug = `phase3-${suffix}`;
const createdUserIds: string[] = [];
const createdPortfolioIds: string[] = [];
const snapshotKeys: string[] = [];

function auth(label: string): AuthUser {
  return {
    sub: `phase3-test-${label}-${suffix}`,
    email: `phase3-test-${label}-${suffix}@example.invalid`,
    name: `Phase 3 ${label}`,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
}

function quote(symbol: string, market: Market, nativePrice: string, currency: "KRW" | "USD" = "KRW", fxRate = "1"): TradingQuote {
  return {
    ticker: { code: symbol, name: symbol === "RANKA" ? "랭크한국" : "Rank US", market, assetType: "STOCK", marketCap: 1, price: Number(nativePrice), currency },
    nativePrice,
    nativeCurrency: currency,
    quoteSource: `${sourcePrefix}-price`,
    quoteAt: now,
    quoteReceivedAt: new Date(),
    fxRate,
    fxSource: `${sourcePrefix}-fx`,
    fxAt: now,
    fxReceivedAt: new Date(),
  };
}

const playerA = auth("a");
const playerB = auth("b");
const playerC = auth("c");

try {
  await database.insert(seasons).values({
    slug: seasonSlug,
    name: `Phase 3 검증 ${suffix}`,
    status: "open",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    initialCashKrw: "100000000.00",
  });
  await enrollInActiveSeason(playerA, { nickname: `순위A_${suffix}`.slice(0, 16), acceptedRules: true, activityFeedVisible: true });
  await enrollInActiveSeason(playerB, { nickname: `순위B_${suffix}`.slice(0, 16), acceptedRules: true, activityFeedVisible: false });
  await enrollInActiveSeason(playerC, { nickname: `순위C_${suffix}`.slice(0, 16), acceptedRules: true, activityFeedVisible: true });

  await executeTrade(playerA, { symbol: "RANKA", market: "KOSPI", side: "buy", quantity: 10, clientOrderId: `${suffix}-rank-a` }, async () => quote("RANKA", "KOSPI", "1000000"));
  await executeTrade(playerB, { symbol: "RANKB", market: "NASDAQ", side: "buy", quantity: 100, clientOrderId: `${suffix}-rank-b` }, async () => quote("RANKB", "NASDAQ", "100", "USD", "1000"));

  const first = await refreshLeagueValuation(playerA, async (symbol, market) =>
    symbol === "RANKA" ? quote(symbol, market, "1200000") : quote(symbol, market, "80", "USD", "1000"));
  assert(first.snapshot);
  snapshotKeys.push(first.snapshot.key);
  const firstA = first.participants.find((row) => row.nickname.startsWith("순위A_"));
  const firstB = first.participants.find((row) => row.nickname.startsWith("순위B_"));
  const firstC = first.participants.find((row) => row.nickname.startsWith("순위C_"));
  assert(firstA && firstB && firstC);
  assert.equal(firstA.equityKrw, "102000000.00");
  assert.equal(firstA.totalReturnPct, "2.000000");
  assert.equal(firstB.equityKrw, "98000000.00");
  assert.equal(firstC.equityKrw, "100000000.00");
  assert(firstA.rank < firstC.rank && firstC.rank < firstB.rank);
  assert(first.activity.some((row) => row.nickname === firstA.nickname));
  assert(!first.activity.some((row) => row.nickname === firstB.nickname), "활동 비공개 참가자는 피드에서 제외되어야 합니다.");

  const second = await refreshLeagueValuation(playerA, async (symbol, market) =>
    symbol === "RANKA" ? quote(symbol, market, "900000") : quote(symbol, market, "80", "USD", "1000"));
  assert(second.snapshot);
  snapshotKeys.push(second.snapshot.key);
  const secondA = second.participants.find((row) => row.profileId === firstA.profileId)!;
  assert.equal(secondA.equityKrw, "99000000.00");
  assert(secondA.rank > firstA.rank);
  assert(secondA.rankMovement !== null && secondA.rankMovement < 0);
  assert(new Decimal(secondA.maxDrawdownPct).gt(0));

  const hiddenDetail = await getPublicPlayerDetail(playerA, firstB.profileId);
  assert.equal(hiddenDetail.activityHidden, true);
  assert.equal(hiddenDetail.recentTrades.length, 0);
  assert(!JSON.stringify(second).includes(playerA.email));
  assert(!JSON.stringify(hiddenDetail).includes(playerB.email));

  const testSubs = [playerA.sub, playerB.sub, playerC.sub];
  const accountRows = await database.select({ id: users.id }).from(users).where(inArray(users.googleSub, testSubs));
  createdUserIds.push(...accountRows.map((row) => row.id));
  const portfolioRows = await database.select().from(portfolios).where(inArray(portfolios.userId, createdUserIds));
  createdPortfolioIds.push(...portfolioRows.map((row) => row.id));
  const latestRows = await database.select().from(leaderboardSnapshots).where(eq(leaderboardSnapshots.snapshotKey, second.snapshot.key));
  for (const snapshot of latestRows) {
    const portfolio = portfolioRows.find((row) => row.id === snapshot.portfolioId)!;
    const holdingRows = await database.select().from(positions).where(and(eq(positions.portfolioId, snapshot.portfolioId), eq(positions.quantity, 0))).catch(() => []);
    assert(portfolio);
    assert.equal(snapshot.equityKrw, portfolio.equityKrw);
    assert(Array.isArray(holdingRows));
    const ledgerRows = await database.select().from(cashLedger).where(eq(cashLedger.portfolioId, snapshot.portfolioId));
    const cashFromLedger = ledgerRows.reduce((sum, row) => sum.plus(row.amountKrw), new Decimal(0));
    assert.equal(cashFromLedger.toFixed(2), snapshot.cashKrw);
  }

  console.log("Phase 3 검증 완료: 한·미 포트폴리오 평가, 순위 이동, 원장 정합성, 활동 비공개와 이메일 차단이 확인되었습니다.");
} finally {
  if (!createdUserIds.length) {
    const accountRows = await database.select({ id: users.id }).from(users).where(inArray(users.googleSub, [playerA.sub, playerB.sub, playerC.sub]));
    createdUserIds.push(...accountRows.map((row) => row.id));
  }
  if (createdUserIds.length && !createdPortfolioIds.length) {
    const rows = await database.select({ id: portfolios.id }).from(portfolios).where(inArray(portfolios.userId, createdUserIds));
    createdPortfolioIds.push(...rows.map((row) => row.id));
  }
  if (snapshotKeys.length) await database.delete(leaderboardSnapshots).where(inArray(leaderboardSnapshots.snapshotKey, snapshotKeys));
  if (createdPortfolioIds.length) {
    const orderRows = await database.select({ id: orders.id }).from(orders).where(inArray(orders.portfolioId, createdPortfolioIds));
    if (orderRows.length) await database.delete(executions).where(inArray(executions.orderId, orderRows.map((row) => row.id)));
    await database.delete(cashLedger).where(inArray(cashLedger.portfolioId, createdPortfolioIds));
    await database.delete(positions).where(inArray(positions.portfolioId, createdPortfolioIds));
    await database.delete(orders).where(inArray(orders.portfolioId, createdPortfolioIds));
    await database.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
  }
  if (createdUserIds.length) {
    await database.delete(gameProfiles).where(inArray(gameProfiles.userId, createdUserIds));
    await database.delete(users).where(inArray(users.id, createdUserIds));
  }
  await database.delete(priceSnapshots).where(eq(priceSnapshots.source, `${sourcePrefix}-price`));
  await database.delete(fxSnapshots).where(eq(fxSnapshots.source, `${sourcePrefix}-fx`));
  await database.delete(seasons).where(eq(seasons.slug, seasonSlug));
  await closeDb();
}
