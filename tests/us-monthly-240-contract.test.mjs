import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("US monthly screening history is durably cached for MA10 and MA240", async () => {
  const [market, schema, chart] = await Promise.all([
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chart/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(market, /if \(years <= 15\) return fetchUsDailyChartWindowUncached/);
  assert.match(market, /windowStart\.setFullYear\(windowStart\.getFullYear\(\) - 8\)/);
  assert.match(market, /limit=5000/);
  assert.match(market, /export async function fetchUsMonthlyChart/);
  assert.match(market, /query1\.finance\.yahoo\.com\/v8\/finance\/chart/);
  assert.match(market, /US_MONTHLY_SPLIT_ADJUSTED_SOURCE = "yahoo-split-adjusted"/);
  assert.match(market, /source: sql`excluded\.source`/);
  assert.match(market, /split-adjusted, non-dividend-adjusted close/);
  assert.match(market, /TIME_SERIES_MONTHLY_ADJUSTED/);
  assert.match(market, /5\. adjusted close/);
  assert.match(market, /Technical indicators must use a split\/dividend-adjusted series/);
  assert.match(market, /usMonthlyHistory/);
  assert.match(market, /fetchUsMonthlyScreenChart/);
  assert.match(market, /fetchUsWeeklyScreenChart/);
  assert.match(market, /US_SCREEN_LIVE_CANDLE_CACHE_MS = 30 \* 60_000/);
  assert.match(market, /fetchUsRecentDailyChart/);
  assert.match(schema, /export const usMonthlyHistory = pgTable\(/);
  assert.match(schema, /us_monthly_history_market_code_period_unique/);
  assert.match(schema, /export const usWeeklyHistory = pgTable\(/);
  assert.match(schema, /us_weekly_history_market_code_period_unique/);
  assert.match(chart, /fetchUsMonthlyChart\(ticker\)/);
});
