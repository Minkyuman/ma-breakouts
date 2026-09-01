import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("league research keeps dated notes public by nickname without financial or email data", async () => {
  const [schema, research, route, page, styles] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game-research.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/research-notes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /league_research_picks/);
  assert.match(schema, /analysisDate/);
  assert.match(schema, /researchNote: text/);
  assert.match(schema, /char_length\(.+\) <= 10000/);
  assert.doesNotMatch(schema, /league_research_picks_season_user_security_unique/);
  assert.match(research, /PAGE_SIZE = 20/);
  assert.match(research, /nextCursor/);
  assert.match(research, /total: number/);
  assert.match(research, /searchUniverse/);
  assert.match(research, /MARKET_RESEARCH_TICKERS/);
  assert.match(research, /sp500/);
  assert.match(research, /createLeagueResearchNote/);
  assert.match(research, /deleteLeagueResearchNote/);
  assert.match(research, /ensureLeagueResearchStorage/);
  assert.match(research, /pg_advisory_xact_lock/);
  assert.match(research, /enable row level security/);
  assert.match(research, /nickname: row\.profile\.nickname/);
  assert.doesNotMatch(research, /email:/);
  assert.match(route, /getSession/);
  assert.match(route, /league_research_note_write/);
  assert.match(route, /GET/);
  assert.match(route, /POST/);
  assert.match(route, /DELETE/);
  assert.match(page, /분석 노트/);
  assert.match(page, /분석 기준일/);
  assert.match(page, /SecurityResearchNotes/);
  assert.match(page, /리그 노트/);
  assert.match(page, /workspaceTab/);
  assert.match(page, /주요 지수/);
  assert.match(page, /돌파 후보/);
  assert.match(page, /MARKET:/);
  assert.match(page, /ReactMarkdown/);
  assert.match(page, /remarkGfm/);
  assert.match(page, /skipHtml/);
  assert.match(page, /전체 분석 노트/);
  assert.match(page, /전문 보기/);
  assert.match(page, /분석 노트 5개 더 보기/);
  assert.match(page, /이전 분석 20개 불러오기/);
  assert.match(styles, /research-note-markdown/);
  assert.match(styles, /research-note-preview/);
});
