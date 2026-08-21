import { NextResponse } from "next/server";
import { fetchUniverse, type MarketFilter } from "@/lib/market";

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("market") ?? "all";
    const market: MarketFilter = ["all", "kospi", "kosdaq"].includes(value)
      ? (value as MarketFilter)
      : "all";
    const tickers = await fetchUniverse(market);
    return NextResponse.json({ tickers, count: tickers.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종목 목록을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
