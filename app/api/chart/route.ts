import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import {
  aggregateCandles,
  fetchTickerDailyChart,
  fetchUsMonthlyChart,
  getUsMonthlySource,
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

async function fallbackAfter<T>(promise: Promise<T>, fallback: T, timeoutMs = 3_500): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    const usesCachedUsMonthly = !isKoreanMarket && timeframe === "monthly";
    const dailyPromise = fetchTickerDailyChart;
    const chartPromise = fallbackAfter(
      usesCachedUsMonthly
        ? fetchUsMonthlyChart(ticker)
        : dailyPromise(ticker, timeframe === "daily" ? 3 : historyYears(timeframe, 240)),
      [],
      25_000,
    );
    // Monthly cache rows are sufficient for the long chart, but the compact
    // daily/weekly change badges still need a recent daily window.
    const changesPromise = usesCachedUsMonthly ? fallbackAfter(dailyPromise(ticker, 3), []) : chartPromise;
    // These enrich the header only. During a large US scan Nasdaq can throttle
    // profile/constituent lookups; never let those optional calls hold back a
    // chart whose candle series is already available.
    const classificationPromise = fallbackAfter(fetchSecurityClassification(ticker), {});
    const metadataPromise = isKoreanMarket
      ? Promise.all([classificationPromise, Promise.resolve(undefined), Promise.resolve(undefined)])
      : assetType === "ETF"
        ? Promise.all([classificationPromise, fallbackAfter(fetchUsdKrwRate(), undefined), Promise.resolve(false)])
        : Promise.all([classificationPromise, fallbackAfter(fetchUsdKrwRate(), undefined), fallbackAfter(fetchNasdaq100Membership(code), false)]);
    const [daily, changesDaily, [classification, exchangeRate, isNasdaq100]] = await Promise.all([chartPromise, changesPromise, metadataPromise]);
    const points = withMovingAverages(aggregateCandles(daily, timeframe));
    const changes = {
      daily: summarizeChange(aggregateCandles(changesDaily, "daily")),
      weekly: summarizeChange(aggregateCandles(changesDaily, "weekly")),
      monthly: summarizeChange(aggregateCandles(changesDaily, "monthly")),
    };
    if (usesCachedUsMonthly) {
      const latest = points.at(-1);
      console.info(JSON.stringify({ service: "chart", event: "us_monthly_source", code, source: getUsMonthlySource(code), rows: points.length, latestClose: latest?.close ?? null, latestMa240: latest?.ma240 ?? null }));
    }
    return NextResponse.json(
      { points: points.slice(-360), timeframe, movingAverages: [5, 10, 240], changes, currency: isKoreanMarket ? "KRW" : "USD", exchangeRate, isNasdaq100, classification, monthlySource: usesCachedUsMonthly ? getUsMonthlySource(code) : null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
