import { NextResponse } from "next/server";
import { screenTicker, type Ticker, type Timeframe } from "@/lib/market";

type ScreenRequest = {
  tickers?: Ticker[];
  timeframe?: Timeframe;
  maPeriod?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScreenRequest;
    const tickers = Array.isArray(body.tickers) ? body.tickers.slice(0, 30) : [];
    const timeframe = body.timeframe === "monthly" ? "monthly" : "weekly";
    const maPeriod = body.maPeriod === 240 ? 240 : 10;
    if (!tickers.length) {
      return NextResponse.json({ error: "분석할 종목이 없습니다." }, { status: 400 });
    }
    const settled = await Promise.allSettled(
      tickers.map((ticker) => screenTicker(ticker, timeframe, maPeriod)),
    );
    const matches = settled.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
    const failures = settled.filter((result) => result.status === "rejected").length;
    return NextResponse.json({ matches, failures, processed: tickers.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배치 분석에 실패했습니다." },
      { status: 502 },
    );
  }
}
