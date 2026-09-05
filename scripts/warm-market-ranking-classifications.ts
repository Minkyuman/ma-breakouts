import {
  fetchSecurityClassification,
  fetchUniverse,
  fetchUsUniverse,
  type MarketFilter,
  type MarketRankMetric,
  type Ticker,
} from "../lib/market";

const KR_MARKETS: MarketFilter[] = ["kospi", "kosdaq"];
const US_MARKETS: MarketFilter[] = ["nasdaq", "nyse", "amex"];
const KR_METRICS: MarketRankMetric[] = ["tradingValue", "changePct", "volume", "marketCap"];
const US_METRICS: MarketRankMetric[] = ["changePct", "marketCap"];
const TOP_PER_RANKING = 100;
const WORKERS = 4;

function metricValue(ticker: Ticker, metric: MarketRankMetric) {
  if (metric === "tradingValue") return ticker.tradingValue;
  if (metric === "changePct") return ticker.changePct;
  if (metric === "volume") return ticker.tradingVolume;
  return ticker.marketCap;
}

function rankingTargets(tickers: Ticker[], metrics: MarketRankMetric[]) {
  return metrics.flatMap((metric) => tickers
    .filter((ticker) => {
      const value = metricValue(ticker, metric);
      return typeof value === "number" && Number.isFinite(value) && value > 0;
    })
    .sort((left, right) => (metricValue(right, metric) ?? -1) - (metricValue(left, metric) ?? -1) || right.marketCap - left.marketCap)
    .slice(0, TOP_PER_RANKING));
}

async function collectTargets() {
  const [krGroups, usGroups] = await Promise.all([
    Promise.all(KR_MARKETS.map((market) => fetchUniverse(market, "all"))),
    Promise.all(US_MARKETS.map((market) => fetchUsUniverse(market, "all"))),
  ]);
  const targets = [
    ...krGroups.flatMap((tickers) => rankingTargets(tickers, KR_METRICS)),
    ...usGroups.flatMap((tickers) => rankingTargets(tickers, US_METRICS)),
  ];
  return [...new Map(targets.map((ticker) => [`${ticker.market}:${ticker.code}`, ticker])).values()];
}

async function main() {
  const targets = await collectTargets();
  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(WORKERS, targets.length) }, async () => {
    while (nextIndex < targets.length) {
      const ticker = targets[nextIndex++];
      try {
        await fetchSecurityClassification(ticker);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
  });
  await Promise.all(workers);
  console.info(JSON.stringify({
    service: "line-breaker-classification-cache",
    event: "market-rankings-warm.completed",
    targets: targets.length,
    completed,
    failed,
  }));
  if (!completed) throw new Error("시장순위 분류 캐시를 채우지 못했습니다.");
}

await main();
