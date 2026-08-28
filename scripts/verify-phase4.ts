import assert from "node:assert/strict";

import { and, eq } from "drizzle-orm";

import { closeDb, getDb } from "../db/index";
import { auditEvents, rateLimitBuckets, seasons, users } from "../db/schema";
import { createSeasonAsAdmin, GameAdminError, getAdminGameOverview } from "../lib/game-admin";
import { enforceGameRateLimit, gameJson, GameRateLimitError, operationRequestId } from "../lib/game-operations";

if (process.env.ALLOW_PHASE4_DB_TEST !== "true") {
  throw new Error("DB 통합 검증은 ALLOW_PHASE4_DB_TEST=true일 때만 실행할 수 있습니다.");
}

const suffix = Date.now().toString(36);
const database = getDb();
const adminSub = `phase4-admin-${suffix}`;
const participantSub = `phase4-participant-${suffix}`;
const adminEmail = `${adminSub}@example.invalid`;
const requestId = `phase4-${suffix}-request`;
const seasonSlug = `phase4-${suffix}`;
const fixedNow = new Date("2040-01-01T00:00:15.000Z");
const fixedWindow = new Date("2040-01-01T00:00:00.000Z");
const adminUser = { sub: adminSub, email: adminEmail, name: "Phase 4 관리자", exp: Math.floor(Date.now() / 1000) + 600 };
const participantUser = { sub: participantSub, email: `${participantSub}@example.invalid`, name: "Phase 4 참가자", exp: Math.floor(Date.now() / 1000) + 600 };

try {
  await database.insert(users).values([
    { googleSub: adminSub, email: adminEmail, displayName: adminUser.name, role: "admin" },
    { googleSub: participantSub, email: participantUser.email, displayName: participantUser.name, role: "participant" },
  ]);

  const first = await enforceGameRateLimit(adminUser, "admin_season_create", { limit: 2, windowSeconds: 60, now: fixedNow });
  const second = await enforceGameRateLimit(adminUser, "admin_season_create", { limit: 2, windowSeconds: 60, now: fixedNow });
  assert.equal(first.remaining, 1);
  assert.equal(second.remaining, 0);
  await assert.rejects(
    enforceGameRateLimit(adminUser, "admin_season_create", { limit: 2, windowSeconds: 60, now: fixedNow }),
    (error) => error instanceof GameRateLimitError && error.retryAfterSeconds === 45,
  );
  const nextWindow = await enforceGameRateLimit(adminUser, "admin_season_create", { limit: 2, windowSeconds: 60, now: new Date("2040-01-01T00:01:00.000Z") });
  assert.equal(nextWindow.remaining, 1, "다음 시간창에서는 요청 한도가 초기화되어야 합니다.");

  await assert.rejects(
    createSeasonAsAdmin(participantUser, {}, requestId),
    (error) => error instanceof GameAdminError && error.code === "FORBIDDEN",
  );

  const season = await createSeasonAsAdmin(adminUser, {
    slug: seasonSlug,
    name: `Phase 4 검증 ${suffix}`,
    status: "draft",
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    initialCashKrw: "100000000",
    ruleVersion: 1,
  }, requestId);
  assert.equal(season.status, "draft");

  const [audit] = await database.select().from(auditEvents).where(and(eq(auditEvents.targetId, season.id), eq(auditEvents.requestId, requestId)));
  assert(audit);
  assert.equal(audit.action, "season.created");
  assert.equal(audit.metadata.slug, seasonSlug);

  const overview = await getAdminGameOverview(adminUser);
  assert(overview.seasons.some((row) => row.id === season.id));
  assert(overview.auditEvents.some((row) => row.id === audit.id));
  assert(!JSON.stringify(overview).includes(adminEmail));
  assert(!JSON.stringify(overview).includes(adminSub));

  const suppliedRequest = operationRequestId(new Request("https://example.invalid", { headers: { "x-request-id": "valid-request-123" } }));
  assert.equal(suppliedRequest, "valid-request-123");
  const generatedRequest = operationRequestId(new Request("https://example.invalid", { headers: { "x-request-id": "bad value" } }));
  assert.notEqual(generatedRequest, "bad value");
  const response = gameJson(requestId, { ok: true });
  assert.equal(response.headers.get("x-request-id"), requestId);
  assert.equal(response.headers.get("cache-control"), "no-store");

  console.log("Phase 4 검증 완료: DB 요청 제한, 관리자 권한, 원자적 시즌 감사 기록, 요청 추적 ID와 개인정보 차단이 확인되었습니다.");
} finally {
  const [season] = await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.slug, seasonSlug)).limit(1);
  if (season) {
    await database.delete(auditEvents).where(eq(auditEvents.targetId, season.id));
    await database.delete(seasons).where(eq(seasons.id, season.id));
  }
  await database.delete(rateLimitBuckets).where(and(eq(rateLimitBuckets.action, "admin_season_create"), eq(rateLimitBuckets.windowStartedAt, fixedWindow)));
  await database.delete(rateLimitBuckets).where(and(eq(rateLimitBuckets.action, "admin_season_create"), eq(rateLimitBuckets.windowStartedAt, new Date("2040-01-01T00:01:00.000Z"))));
  await database.delete(users).where(eq(users.googleSub, participantSub));
  await database.delete(users).where(eq(users.googleSub, adminSub));
  await closeDb();
}
