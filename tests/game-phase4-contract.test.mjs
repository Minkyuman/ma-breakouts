import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 4 rate limits mutations and audits administrator changes", async () => {
  const [operations, admin, adminAnalysis, adminAnalysisRoute, adminAssignment, localPreview, orderRoute, rankingRoute, page, styles, game, vercelConfig] = await Promise.all([
    readFile(new URL("../lib/game-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-analysis.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/analysis/model/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/assign-development-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/preview-vercel-build.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/leaderboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/game.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);

  assert.match(operations, /SHA-256/);
  assert.match(operations, /onConflictDoUpdate/);
  assert.match(operations, /RATE_LIMITED/);
  assert.match(operations, /x-request-id/);
  assert.match(orderRoute, /game_order/);
  assert.match(rankingRoute, /league_valuation/);
  assert.match(admin, /season\.created/);
  assert.match(admin, /auditEvents/);
  assert.match(admin, /analysisModel/);
  assert.match(admin, /isGameAdminEmail/);
  assert.match(game, /isGameAdminEmail/);
  assert.match(adminAnalysis, /analysis\.model_updated/);
  assert.match(adminAnalysisRoute, /admin_analysis_model_update/);
  assert.doesNotMatch(admin, /users\.email/);
  assert.match(adminAssignment, /ALLOW_DEV_ADMIN_ASSIGNMENT/);
  assert.match(adminAssignment, /EXPECTED_DEV_PROJECT_REF/);
  assert.match(adminAssignment, /\.for\("update"\)/);
  assert.match(adminAssignment, /user\.admin_assigned/);
  assert.doesNotMatch(adminAssignment, /minkyuman@gmail\.com/);
  assert.match(localPreview, /functions\/__server\.func\/index\.mjs/);
  assert.match(localPreview, /application\.fetch/);
  assert.match(page, /DB admin 역할 전용/);
  assert.match(page, /심층분석 모델/);
  assert.match(page, /\/api\/admin\/analysis\/model/);
  assert.match(page, /aria-selected=\{false\}/);
  assert.match(styles, /league-admin-form/);
  assert.match(styles, /league-admin-model/);
  assert.match(game, /isAdmin: boolean/);
  assert.match(page, /if \(payload\.game\.isAdmin\) tasks\.push\(loadAdmin/);
  assert.match(page, /Promise\.allSettled\(tasks\)/);
  assert.match(vercelConfig, /"regions": \["icn1"\]/);
});
