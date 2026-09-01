import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import {
  aggregateCandles,
  fetchTickerDailyChart,
  fetchUsdKrwRate,
  fetchNasdaq100Membership,
  fetchSecurityClassification,
  historyYears,
  withMovingAverages,
  type AssetType,
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
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const code = String(params.get("code") ?? "").toUpperCase();
    const name = String(params.get("name") ?? code).trim();
    const market = String(params.get("market") ?? "").toUpperCase() as Market;
    const assetType: AssetType = params.get("asset") === "ETF" ? "ETF" : "STOCK";
    const isKoreanMarket = market === "KOSPI" || market === "KOSDAQ";
    // Some recently listed Korean ETFs use a six-character alphanumeric issue code
    // (for example, 0117V0). Naver's domestic chart API supports those codes too.
    if (!code || (isKoreanMarket && !/^[A-Z0-9]{6}$/.test(code)) || (!isKoreanMarket && !/^[A-Z.-]{1,12}$/.test(code))) {
      return NextResponse.json({ error: "올바른 종목코드가 아닙니다." }, { status: 400 });
    }
    const timeframeValue = params.get("timeframe");
    const timeframe: ChartTimeframe =
      timeframeValue === "daily" || timeframeValue === "monthly" ? timeframeValue : "weekly";
    const ticker = { code, name, market, assetType };
    // US historical candles are the heaviest request. Start supplemental metadata
    // at the same time, then join only after the chart series is ready.
    const dailyPromise = fetchTickerDailyChart(ticker, timeframe === "daily" ? 3 : historyYears(timeframe, 240));
    const classificationPromise = fetchSecurityClassification(ticker);
    const metadataPromise = isKoreanMarket
      ? Promise.all([classificationPromise, Promise.resolve(undefined), Promise.resolve(undefined)])
      : assetType === "ETF"
        ? Promise.all([classificationPromise, fetchUsdKrwRate(), Promise.resolve(false)])
        : Promise.all([classificationPromise, fetchUsdKrwRate(), fetchNasdaq100Membership(code)]);
    const [daily, [classification, exchangeRate, isNasdaq100]] = await Promise.all([dailyPromise, metadataPromise]);
    const points = withMovingAverages(aggregateCandles(daily, timeframe));
    const changes = {
      daily: summarizeChange(aggregateCandles(daily, "daily")),
      weekly: summarizeChange(aggregateCandles(daily, "weekly")),
      monthly: summarizeChange(aggregateCandles(daily, "monthly")),
    };
    return NextResponse.json({ points: points.slice(-360), timeframe, movingAverages: [5, 10, 240], changes, currency: isKoreanMarket ? "KRW" : "USD", exchangeRate, isNasdaq100, classification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
