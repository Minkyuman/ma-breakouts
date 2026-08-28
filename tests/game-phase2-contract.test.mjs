import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 2 trusts server quotes and settles atomically with exact decimals", async () => {
  const [trading, market, route, page, packageJson] = await Promise.all([
    readFile(new URL("../lib/game-trading.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /decimal\.js/);
  assert.match(trading, /new Decimal\(quote\.nativePrice\)/);
  assert.match(trading, /isolationLevel:\s*"serializable"/);
  assert.match(trading, /for\("update"/);
  assert.match(trading, /INSUFFICIENT_CASH/);
  assert.match(trading, /INSUFFICIENT_SHARES/);
  assert.match(trading, /IDEMPOTENCY_CONFLICT/);
  assert.match(trading, /trade_settlement/);
  assert.match(trading, /priceSnapshots/);
  assert.match(trading, /fxSnapshots/);
  assert.match(route, /executeTrade\(user/);
  assert.doesNotMatch(trading, /input\.(?:price|fxRate|cash|equity)/);
  assert.match(market, /fetchTradingQuote/);
  assert.match(market, /STALE_QUOTE/);
  assert.match(market, /STALE_FX/);
  assert.match(page, /사이버 머니 · 실제 주문 아님/);
  assert.match(page, /화면의 예상 금액과 실제 모의 체결 금액은 다를 수 있습니다/);
  assert.match(page, /시세 시각/);
});
