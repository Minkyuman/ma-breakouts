import { NextResponse } from "next/server";
import {
  aggregateCandles,
  fetchTickerDailyChart,
  fetchUsdKrwRate,
  fetchNasdaq100Membership,
  historyYears,
  withMovingAverages,
  type ChartTimeframe,
  type Market,
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
    const market = String(params.get("market") ?? "").toUpperCase() as Market;
    const isKoreanMarket = market === "KOSPI" || market === "KOSDAQ";
    if (!code || (isKoreanMarket && !/^\d{6}$/.test(code)) || (!isKoreanMarket && !/^[A-Z.\-]{1,12}$/.test(code))) {
      return NextResponse.json({ error: "올바른 종목코드가 아닙니다." }, { status: 400 });
    }
    const timeframeValue = params.get("timeframe");
    const timeframe: ChartTimeframe =
      timeframeValue === "daily" || timeframeValue === "monthly" ? timeframeValue : "weekly";
    const daily = await fetchTickerDailyChart({ code, market }, timeframe === "daily" ? 3 : historyYears(timeframe, 240));
    const points = withMovingAverages(aggregateCandles(daily, timeframe));
    const changes = {
      daily: summarizeChange(aggregateCandles(daily, "daily")),
      weekly: summarizeChange(aggregateCandles(daily, "weekly")),
      monthly: summarizeChange(aggregateCandles(daily, "monthly")),
    };
    const [exchangeRate, isNasdaq100] = isKoreanMarket
      ? [undefined, undefined]
      : await Promise.all([fetchUsdKrwRate(), fetchNasdaq100Membership(code)]);
    return NextResponse.json({ points: points.slice(-360), timeframe, movingAverages: [5, 10, 240], changes, currency: isKoreanMarket ? "KRW" : "USD", exchangeRate, isNasdaq100 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
