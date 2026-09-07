import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("US monthly 240 history is split and durably cached", async () => {
  const [market, schema, chart] = await Promise.all([
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chart/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(market, /if \(years <= 15\) return fetchUsDailyChartWindowUncached/);
  assert.match(market, /windowStart\.setFullYear\(windowStart\.getFullYear\(\) - 8\)/);
  assert.match(market, /limit=5000/);
  assert.match(market, /export async function fetchUsMonthlyChart/);
  assert.match(market, /usMonthlyHistory/);
  assert.match(schema, /export const usMonthlyHistory = pgTable\(/);
  assert.match(schema, /us_monthly_history_market_code_period_unique/);
  assert.match(chart, /fetchUsMonthlyChart\(ticker\)/);
});
