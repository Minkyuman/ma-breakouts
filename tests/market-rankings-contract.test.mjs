import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("market rankings expose the four ranking metrics without bypassing the login gate", async () => {
  const [route, classifications, market, page] = await Promise.all([
    readFile(new URL("../app/api/market-rankings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market-rankings/classifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getSession\(request\)/);
  assert.match(route, /tradingValue.*changePct.*volume.*marketCap/s);
  assert.match(route, /slice\(0, 100\)/);
  assert.match(route, /fetchSecurityClassification/);
  assert.match(route, /enrichRankedItems/);
  assert.match(route, /Math\.min\(20, items\.length\)/);
  assert.match(route, /classificationStatus/);
  assert.match(classifications, /getSession\(request\)/);
  assert.match(classifications, /MAX_ITEMS = 100/);
  assert.match(classifications, /fetchSecurityClassification/);
  assert.match(classifications, /fetchNasdaq100Membership/);
  assert.match(classifications, /classificationStatus/);
  assert.match(market, /tradingValue\?: number/);
  assert.match(market, /ensureClassificationCacheStorage/);
  assert.match(market, /security_classification_cache/);
  assert.doesNotMatch(market, /const CLASSIFICATION_CACHE_TTL_MS/);
  assert.match(market, /accumulatedTradingValueRaw/);
  assert.match(market, /fluctuationsRatio/);
  assert.match(page, /MARKET_RANK_METRICS/);
  assert.match(page, /\{ id: "marketCap", label: "시가총액"[\s\S]*\{ id: "tradingValue", label: "거래대금"/);
  assert.match(page, /useState<MarketRankMetric>\("marketCap"\)/);
  assert.match(page, /거래대금/);
  assert.match(page, /등락률/);
  assert.match(page, /거래량/);
  assert.match(page, /시가총액/);
  assert.match(page, /\/api\/market-rankings/);
  assert.match(page, /filteredRankedTickers/);
  assert.match(page, /rankingClassificationFilters/);
  assert.match(page, /toggleRankingClassificationFilter/);
  assert.match(page, /\/api\/market-rankings\/classifications/);
  assert.match(page, /if \(pendingItems\.length\) \{/);
  assert.doesNotMatch(page, /region === "us" && pendingItems\.length/);
  assert.match(page, /섹터 정보 없음/);
  assert.match(page, /candidate-classification/);
  assert.match(page, /NASDAQ 100/);
  assert.match(page, /setDirectTicker\(item\);\s*setSelectedKey\(""\);\s*setChartTimeframe\("weekly"\);/s);
  assert.match(page, /const confirmedTradingVolume = typeof item\.tradingVolume === "number" && item\.tradingVolume > 0/);
  assert.match(page, /secondaryMetric && <small>\{secondaryMetric\}<\/small>/);
  assert.match(page, /const batchController = new AbortController\(\)/);
  assert.match(page, /batchController\.abort\(\)/);
  assert.match(page, /A single provider timeout must not reject the worker/);
});
