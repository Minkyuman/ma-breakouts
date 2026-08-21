import { NextResponse } from "next/server";
import { fetchUniverse, type AssetFilter, type MarketFilter } from "@/lib/market";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const value = params.get("market") ?? "all";
    const market: MarketFilter = ["all", "kospi", "kosdaq"].includes(value)
      ? (value as MarketFilter)
      : "all";
    const assetValue = params.get("asset") ?? "all";
    const asset: AssetFilter = ["all", "stock", "etp"].includes(assetValue)
      ? (assetValue as AssetFilter)
      : "all";
    const tickers = await fetchUniverse(market, asset);
    return NextResponse.json({ tickers, count: tickers.length, market, asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종목 목록을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
