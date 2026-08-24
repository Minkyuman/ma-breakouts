import { NextResponse } from "next/server";
import {
  aggregateCandles,
  fetchDailyChart,
  historyYears,
  withMovingAverages,
  type ChartTimeframe,
} from "@/lib/market";

function summarizeChange(candles: Array<{ close: number }>) {
  const current = candles.at(-1)?.close;
  const previous = candles.at(-2)?.close;
  if (current === undefined || previous === undefined || previous <= 0) return null;
  const change = current - previous;
  return { current, previous, change, changePct: (change / previous) * 100 };
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const code = String(params.get("code") ?? "").toUpperCase();
    if (!/^[0-9A-Z]{6}$/.test(code)) {
      return NextResponse.json({ error: "올바른 종목코드가 아닙니다." }, { status: 400 });
    }
    const timeframeValue = params.get("timeframe");
    const timeframe: ChartTimeframe =
      timeframeValue === "daily" || timeframeValue === "monthly" ? timeframeValue : "weekly";
    const daily = await fetchDailyChart(code, timeframe === "daily" ? 3 : historyYears(timeframe, 240));
    const points = withMovingAverages(aggregateCandles(daily, timeframe));
    const changes = {
      daily: summarizeChange(aggregateCandles(daily, "daily")),
      weekly: summarizeChange(aggregateCandles(daily, "weekly")),
      monthly: summarizeChange(aggregateCandles(daily, "monthly")),
    };
  return NextResponse.json({ points: points.slice(-360), timeframe, movingAverages: [5, 10, 240], changes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
