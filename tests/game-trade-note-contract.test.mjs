import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trade notes are immutable order intent and respect league activity privacy", async () => {
  const [schema, trading, league, page, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-trading.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-league.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_milky_meteorite.sql", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /tradeNote: varchar\("trade_note", \{ length: 200 \}\)/);
  assert.match(migration, /ADD COLUMN "trade_note" varchar\(200\)/);
  assert.match(trading, /normalizeTradeNote/);
  assert.match(trading, /Array\.from\(note\)\.length > 200/);
  assert.match(trading, /existing\.tradeNote === intent\.tradeNote/);
  assert.match(trading, /tradeNote: intent\.tradeNote/);
  assert.match(league, /eq\(gameProfiles\.activityFeedVisible, true\)/);
  assert.match(league, /tradeNote: orders\.tradeNote/);
  assert.match(page, /매매 메모/);
  assert.match(page, /체결 후 수정할 수 없습니다/);
  assert.match(page, /개인 의견이며 투자 권유가 아닙니다/);
  assert.match(page, /selectedPlayer\.recentTrades/);
});
