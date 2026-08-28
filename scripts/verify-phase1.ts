import assert from "node:assert/strict";

import { and, eq } from "drizzle-orm";

import { closeDb, getDb } from "../db/index";
import { cashLedger, gameProfiles, portfolios, users } from "../db/schema";
import { enrollInActiveSeason, getGameOverview } from "../lib/game";

if (process.env.ALLOW_PHASE1_DB_TEST !== "true") {
  throw new Error("DB 통합 검증은 ALLOW_PHASE1_DB_TEST=true일 때만 실행할 수 있습니다.");
}

const suffix = Date.now().toString(36);
const googleSub = `phase1-test-${suffix}`;
const nickname = `검증_${suffix}`.slice(0, 16);
const database = getDb();

const authUser = {
  sub: googleSub,
  email: `${googleSub}@example.invalid`,
  name: "Phase 1 검증 사용자",
  exp: Math.floor(Date.now() / 1000) + 600,
};

try {
  const enrollments = await Promise.all(
    Array.from({ length: 8 }, () =>
      enrollInActiveSeason(authUser, {
        nickname,
        acceptedRules: true,
        activityFeedVisible: true,
      }),
    ),
  );

  assert(enrollments.every((result) => result.status === "ready"));

  const accounts = await database
    .select()
    .from(users)
    .where(eq(users.googleSub, googleSub));
  assert.equal(accounts.length, 1, "사용자는 하나만 생성되어야 합니다.");

  const profiles = await database
    .select()
    .from(gameProfiles)
    .where(eq(gameProfiles.userId, accounts[0].id));
  assert.equal(profiles.length, 1, "게임 프로필은 하나만 생성되어야 합니다.");

  const createdPortfolios = await database
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, accounts[0].id));
  assert.equal(createdPortfolios.length, 1, "시즌 포트폴리오는 하나만 생성되어야 합니다.");
  assert.equal(createdPortfolios[0].cashKrw, "100000000.00");
  assert.equal(createdPortfolios[0].equityKrw, "100000000.00");

  const ledger = await database
    .select()
    .from(cashLedger)
    .where(
      and(
        eq(cashLedger.portfolioId, createdPortfolios[0].id),
        eq(cashLedger.idempotencyKey, "season-seed:v1"),
      ),
    );
  assert.equal(ledger.length, 1, "시작 자금 원장은 하나만 생성되어야 합니다.");
  assert.equal(ledger[0].amountKrw, "100000000.00");

  const overview = await getGameOverview(authUser);
  const publicPayload = JSON.stringify(overview);
  assert.equal(overview.status, "ready");
  assert(!publicPayload.includes(authUser.email), "공개 응답에 이메일이 포함되면 안 됩니다.");
  assert(!publicPayload.includes(authUser.sub), "공개 응답에 Google 식별자가 포함되면 안 됩니다.");

  console.log("Phase 1 검증 완료: 동시 8회 참가에도 사용자·포트폴리오·시드 원장이 각각 1개입니다.");
} finally {
  const [account] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSub, googleSub))
    .limit(1);

  if (account) {
    const testPortfolios = await database
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.userId, account.id));
    for (const portfolio of testPortfolios) {
      await database.delete(cashLedger).where(eq(cashLedger.portfolioId, portfolio.id));
      await database.delete(portfolios).where(eq(portfolios.id, portfolio.id));
    }
    await database.delete(gameProfiles).where(eq(gameProfiles.userId, account.id));
    await database.delete(users).where(eq(users.id, account.id));
  }

  await closeDb();
}
