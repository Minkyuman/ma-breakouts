import { NextResponse } from "next/server";
import {
  aggregateCandles,
  fetchDailyChart,
  historyYears,
  withMovingAverage,
  type Timeframe,
} from "@/lib/market";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const code = String(params.get("code") ?? "").toUpperCase();
    if (!/^[0-9A-Z]{6}$/.test(code)) {
      return NextResponse.json({ error: "올바른 종목코드가 아닙니다." }, { status: 400 });
    }
    const timeframe: Timeframe = params.get("timeframe") === "monthly" ? "monthly" : "weekly";
    const maPeriod = Number(params.get("ma")) === 240 ? 240 : 10;
    const daily = await fetchDailyChart(code, historyYears(timeframe, maPeriod));
    const points = withMovingAverage(aggregateCandles(daily, timeframe), maPeriod);
    return NextResponse.json({ points: points.slice(-180), timeframe, maPeriod });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
