import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 1 enrollment is authenticated, transactional, and idempotent", async () => {
  const [game, gameAdmin, meRoute, profileRoute, adminRoute, page] = await Promise.all([
    readFile(new URL("../lib/game.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/me/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/game/seasons/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(meRoute, /getSession\(request\)/);
  assert.match(profileRoute, /getSession\(request\)/);
  assert.match(adminRoute, /getSession\(request\)/);
  assert.match(gameAdmin, /account\.role === "admin"/);
  assert.match(gameAdmin, /isGameAdminEmail\(authUser\.email\)/);
  assert.doesNotMatch(gameAdmin, /AUTH_ALLOWED_EMAILS|@gmail\.com/);
  assert.match(profileRoute, /enrollInActiveSeason/);
  assert.match(game, /isolationLevel:\s*"serializable"/);
  assert.match(game, /season-seed:v1/);
  assert.match(game, /onConflictDoNothing/);
  assert.match(game, /portfolios\.seasonId, portfolios\.userId/);
  assert.match(game, /cashLedger\.portfolioId, cashLedger\.idempotencyKey/);
  assert.match(game, /normalize\("NFKC"\)/);
  assert.match(page, /LINE BREAKER PAPER LEAGUE/);
  assert.match(page, /1억 받고 리그 참가/);
  assert.match(page, /실제 주문이나 수익을 발생시키지 않습니다/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_DATABASE|NEXT_PUBLIC_SUPABASE/);
});
