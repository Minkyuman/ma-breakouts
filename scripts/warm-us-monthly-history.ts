import { closeDb } from "../db";
import { fetchUsMonthlyChart, fetchUsUniverse, type Ticker } from "../lib/market";

const requestedStocks = Number(process.argv.find((value) => value.startsWith("--stocks="))?.split("=")[1] ?? "100");
const stockLimit = Number.isFinite(requestedStocks) ? Math.max(0, Math.min(500, requestedStocks)) : 100;
const workersCount = 2;

function rankStocks(tickers: Ticker[]) {
  return [...new Map(tickers.map((ticker) => [`${ticker.market}:${ticker.code}`, ticker])).values()]
    .sort((left, right) => right.marketCap - left.marketCap || left.code.localeCompare(right.code))
    .slice(0, stockLimit);
}

async function main() {
  const [stocks, etfs] = await Promise.all([
    fetchUsUniverse("all", "stock"),
    fetchUsUniverse("all", "etp"),
  ]);
  const targets = [...rankStocks(stocks), ...etfs];
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(workersCount, targets.length) }, async () => {
    while (cursor < targets.length) {
      const ticker = targets[cursor++];
      try {
        const rows = await fetchUsMonthlyChart(ticker);
        if (rows.length >= 241) completed += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.warn(`monthly history warm failed: ${ticker.code}`, error instanceof Error ? error.message : error);
      }
    }
  });
  await Promise.all(workers);
  console.info(JSON.stringify({ service: "line-breaker-us-monthly-history", event: "warm.completed", targets: targets.length, stocks: stockLimit, completed, failed }));
}

try {
  await main();
} finally {
  await closeDb();
}
