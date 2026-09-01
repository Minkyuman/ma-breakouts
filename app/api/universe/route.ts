import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { fetchUniverse, fetchUsUniverse, type AssetFilter, type MarketFilter, type Region } from "@/lib/market";

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const region: Region = params.get("region") === "us" ? "us" : "kr";
    const value = params.get("market") ?? "all";
    const allowedMarkets = region === "us" ? ["all", "nasdaq", "nyse", "amex"] : ["all", "kospi", "kosdaq"];
    const market: MarketFilter = allowedMarkets.includes(value)
      ? (value as MarketFilter)
      : "all";
    const assetValue = params.get("asset") ?? "all";
    const asset: AssetFilter = ["all", "stock", "etp"].includes(assetValue)
      ? (assetValue as AssetFilter)
      : "all";
    const tickers = region === "us" ? await fetchUsUniverse(market, asset) : await fetchUniverse(market, asset);
    const scope = region === "us"
      ? asset === "etp"
        ? "주요 고유동성 미국 ETF (ETN 제외)"
        : asset === "all"
          ? "거래소별 시가총액 상위 1,000 보통주 + 주요 고유동성 미국 ETF"
          : "거래소별 시가총액 상위 1,000 보통주"
      : "전 종목";
    return NextResponse.json({ tickers, count: tickers.length, market, asset, region, scope });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종목 목록을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
