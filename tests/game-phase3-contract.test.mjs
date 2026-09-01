import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 3 rebuilds a private, timestamped leaderboard from server quotes", async () => {
  const [league, schema, page] = await Promise.all([
    readFile(new URL("../lib/game-league.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /leaderboard_snapshots/);
  assert.match(schema, /snapshotKey/);
  assert.match(schema, /maxDrawdownPct/);
  assert.match(league, /fetchTradingQuote/);
  assert.match(league, /pg_advisory_xact_lock/);
  assert.match(league, /isolationLevel:\s*"serializable"/);
  assert.match(league, /oldestQuoteAt/);
  assert.match(league, /activityFeedVisible/);
  assert.match(league, /quote\.ticker\.assetType === "ETF"/);
  assert.match(league, /market === "KOSPI"/);
  assert.match(league, /previousRank - snapshot\.rank/);
  assert.match(league, /cash\.div\(equity\)\.times\(100\)/);
  assert.match(league, /rather than a snapshot cash ratio mixed with post-trade position rows/);
  assert.doesNotMatch(league, /\.email\b|users\.email/);
  assert.match(page, /현재 시세로 갱신/);
  assert.match(page, /공개에 동의한 참가자의 체결만 표시/);
  assert.match(page, /async function refreshRanking/);
  assert.match(page, /체결 내역과 활동을 반영했습니다/);
  assert.match(page, /leagueRefreshRemaining/);
  assert.match(page, /초 후 갱신/);
  assert.match(page, /selectLeagueTab\("activity"\)/);
  assert.match(page, /function leagueSecurityTicker/);
  assert.match(page, /onOpenChart\(leagueSecurityTicker/);
  assert.match(page, /selectedPlayer\.cashKrw.*selectedPlayer\.equityKrw/s);
  assert.match(page, /openSavedSecurityChart/);
  assert.match(page, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});
