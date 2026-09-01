import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instrument search uses a persistent index, shared response cache, and protected scheduled refresh", async () => {
  const [schema, market, searchRoute, refreshRoute, vercelConfig, envExample, migration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/search-index/refresh/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_violet_sauron.sql", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /marketSearchIndex/);
  assert.match(schema, /market_search_index_market_code_unique/);
  assert.match(schema, /market_search_index_name_idx/);
  assert.match(migration, /CREATE TABLE "market_search_index"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(market, /searchIndexedUniverse/);
  assert.match(market, /refreshSearchIndex/);
  assert.match(market, /await refreshSearchIndex\(\)/);
  assert.match(market, /HANGUL_INITIAL_CONSONANTS/);
  assert.match(market, /koreanInitialConsonants/);
  assert.match(market, /initialConsonants/);
  assert.match(market, /onConflictDoUpdate/);
  assert.match(searchRoute, /s-maxage=300/);
  assert.match(searchRoute, /stale-while-revalidate=86400/);
  assert.match(refreshRoute, /process\.env\.CRON_SECRET/);
  assert.match(refreshRoute, /refreshSearchIndex/);
  assert.match(vercelConfig, /api\/internal\/search-index\/refresh/);
  assert.match(envExample, /^CRON_SECRET=$/m);
});
