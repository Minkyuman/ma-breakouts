import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("US screening has a curated liquid ETF universe and uses Nasdaq ETF history", async () => {
  const [market, page, chart] = await Promise.all([
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chart/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(market, /const US_MAJOR_ETFS/);
  assert.match(market, /\["SPY", "SPDR S&P 500 ETF Trust"\]/);
  assert.match(market, /\["QQQ", "Invesco QQQ Trust"\]/);
  assert.match(market, /\["SOXL", "Direxion Daily Semiconductor Bull 3X Shares"\]/);
  assert.match(market, /assetclass=\$\{assetType === "ETF" \? "etf" : "stocks"\}/);
  assert.match(market, /if \(assetFilter === "etp"\) return fetchUsMajorEtfs\(\)/);
  assert.match(market, /fetchUsUniverse\("all", "all"\)/);
  assert.match(market, /const US_CHART_CACHE_MS = 5 \* 60_000/);
  assert.match(market, /const KOREAN_CHART_CACHE_MS = 5 \* 60_000/);
  assert.match(market, /fetchTickerDailyChart\(ticker, 1, false\)/);
  assert.match(market, /ticker\.assetType === "ETF" && ticker\.market === "US_ETF"/);
  assert.match(page, /"주요 ETF"/);
  assert.match(page, /asset=\$\{selected\.assetType\}/);
  assert.match(chart, /params\.get\("asset"\) === "ETF"/);
  assert.match(chart, /const dailyPromise = fetchTickerDailyChart/);
  assert.match(chart, /assetType === "ETF"/);
});
