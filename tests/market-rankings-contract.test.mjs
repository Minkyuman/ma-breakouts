import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("market rankings expose the four ranking metrics without bypassing the login gate", async () => {
  const [route, market, page] = await Promise.all([
    readFile(new URL("../app/api/market-rankings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getSession\(request\)/);
  assert.match(route, /tradingValue.*changePct.*volume.*marketCap/s);
  assert.match(route, /slice\(0, 100\)/);
  assert.match(route, /fetchSecurityClassification/);
  assert.match(route, /enrichRankedItems/);
  assert.match(market, /tradingValue\?: number/);
  assert.match(market, /accumulatedTradingValueRaw/);
  assert.match(market, /fluctuationsRatio/);
  assert.match(page, /MARKET_RANK_METRICS/);
  assert.match(page, /거래대금/);
  assert.match(page, /등락률/);
  assert.match(page, /거래량/);
  assert.match(page, /시가총액/);
  assert.match(page, /\/api\/market-rankings/);
  assert.match(page, /시장 순위 종목 필터/);
  assert.match(page, /filteredRankedTickers/);
  assert.match(page, /ranking-ticker-filter/);
  assert.match(page, /setRankingQuery\(item\.code\)/);
  assert.match(page, /candidate-classification/);
  assert.match(page, /NASDAQ 100/);
  assert.match(page, /setDirectTicker\(item\);\s*setSelectedKey\(""\);\s*setChartTimeframe\("weekly"\);/s);
});
