import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 4 rate limits mutations and audits administrator changes", async () => {
  const [operations, admin, adminAssignment, localPreview, orderRoute, rankingRoute, page, styles] = await Promise.all([
    readFile(new URL("../lib/game-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/assign-development-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/preview-vercel-build.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/leaderboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(operations, /SHA-256/);
  assert.match(operations, /onConflictDoUpdate/);
  assert.match(operations, /RATE_LIMITED/);
  assert.match(operations, /x-request-id/);
  assert.match(orderRoute, /game_order/);
  assert.match(rankingRoute, /league_valuation/);
  assert.match(admin, /season\.created/);
  assert.match(admin, /auditEvents/);
  assert.doesNotMatch(admin, /users\.email/);
  assert.match(adminAssignment, /ALLOW_DEV_ADMIN_ASSIGNMENT/);
  assert.match(adminAssignment, /EXPECTED_DEV_PROJECT_REF/);
  assert.match(adminAssignment, /\.for\("update"\)/);
  assert.match(adminAssignment, /user\.admin_assigned/);
  assert.doesNotMatch(adminAssignment, /minkyuman@gmail\.com/);
  assert.match(localPreview, /functions\/__server\.func\/index\.mjs/);
  assert.match(localPreview, /application\.fetch/);
  assert.match(page, /DB admin 역할 전용/);
  assert.match(page, /aria-selected=\{false\}/);
  assert.match(styles, /league-admin-form/);
});
