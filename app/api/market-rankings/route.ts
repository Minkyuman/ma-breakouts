import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import {
  fetchUniverse,
  fetchNasdaq100Membership,
  fetchSecurityClassification,
  fetchUsUniverse,
  type AssetFilter,
  type MarketFilter,
  type MarketRankMetric,
  type Region,
  type Ticker,
} from "@/lib/market";

const ALLOWED_METRICS: MarketRankMetric[] = ["tradingValue", "changePct", "volume", "marketCap"];

function numberFor(ticker: Ticker, metric: MarketRankMetric) {
  if (metric === "tradingValue") return ticker.tradingValue;
  if (metric === "changePct") return ticker.changePct;
  if (metric === "volume") return ticker.tradingVolume;
  return ticker.marketCap;
}

async function enrichRankedItems(items: Ticker[]) {
  const enriched = items.map((ticker) => ({ ...ticker, classificationStatus: "pending" as const }));
  const enrichmentCount = Math.min(20, items.length);
  let nextIndex = 0;
  // A ranking view can contain 100 securities. Enrich the first visible page
  // only; the complete ranking should not wait on 100 remote profile requests.
  const workers = Array.from({ length: Math.min(6, enrichmentCount) }, async () => {
    while (nextIndex < enrichmentCount) {
      const index = nextIndex++;
      const ticker = items[index];
      try {
        const classification = await fetchSecurityClassification(ticker);
        let isNasdaq100: boolean | undefined;
        if (ticker.market === "NASDAQ" && ticker.assetType === "STOCK") {
          try {
            isNasdaq100 = await fetchNasdaq100Membership(ticker.code);
          } catch {
            // Membership is optional metadata; keep the profile classification.
          }
        }
        const hasClassification = Boolean(classification.sector || classification.industry || classification.themes?.length);
        enriched[index] = { ...ticker, ...classification, isNasdaq100, classificationStatus: hasClassification ? "ready" : "unavailable" };
      } catch {
        // A missing profile must not hide an otherwise valid market ranking.
        enriched[index] = { ...ticker, classificationStatus: "unavailable" };
      }
    }
  });
  await Promise.all(workers);
  return enriched;
}

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const region: Region = params.get("region") === "us" ? "us" : "kr";
    const requestedMarket = params.get("market") ?? "all";
    const allowedMarkets = region === "us" ? ["all", "nasdaq", "nyse", "amex"] : ["all", "kospi", "kosdaq"];
    const market: MarketFilter = allowedMarkets.includes(requestedMarket)
      ? (requestedMarket as MarketFilter)
      : "all";
    const requestedAsset = params.get("asset") ?? "all";
    const asset: AssetFilter = ["all", "stock", "etp"].includes(requestedAsset)
      ? (requestedAsset as AssetFilter)
      : "all";
    const requestedMetric = params.get("metric") ?? "marketCap";
    const metric: MarketRankMetric = ALLOWED_METRICS.includes(requestedMetric as MarketRankMetric)
      ? (requestedMetric as MarketRankMetric)
      : "tradingValue";
    const tickers = region === "us" ? await fetchUsUniverse(market, asset) : await fetchUniverse(market, asset);
    const ranked = tickers
      .filter((ticker) => {
        const value = numberFor(ticker, metric);
        return typeof value === "number" && Number.isFinite(value) && value > 0;
      })
      .sort((left, right) => (numberFor(right, metric) ?? -1) - (numberFor(left, metric) ?? -1) || right.marketCap - left.marketCap || left.code.localeCompare(right.code))
      .slice(0, 100);
    const items = await enrichRankedItems(ranked);
    const asOf = items.find((ticker) => ticker.tradedAt)?.tradedAt ?? null;
    return NextResponse.json({ items, metric, region, market, asset, asOf, unavailable: items.length === 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 순위를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
