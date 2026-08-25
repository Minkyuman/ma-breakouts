import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { aggregateCandles, withMovingAverages, type ChartTimeframe, type DailyRow } from "@/lib/market";

type MarketWatch = {
  id: string;
  name: string;
  shortName: string;
  provider: "naver-index" | "yahoo";
  symbol: string;
  unit: "pt" | "원";
};

export const MARKET_WATCHES: MarketWatch[] = [
  { id: "kospi", name: "코스피", shortName: "KOSPI", provider: "naver-index", symbol: "KOSPI", unit: "pt" },
  { id: "kosdaq", name: "코스닥", shortName: "KOSDAQ", provider: "naver-index", symbol: "KOSDAQ", unit: "pt" },
  { id: "sp500", name: "S&P 500", shortName: "S&P 500", provider: "yahoo", symbol: "^GSPC", unit: "pt" },
  { id: "nasdaq100", name: "나스닥 100", shortName: "NASDAQ 100", provider: "yahoo", symbol: "^NDX", unit: "pt" },
  { id: "nasdaq", name: "나스닥 종합", shortName: "NASDAQ", provider: "yahoo", symbol: "^IXIC", unit: "pt" },
  { id: "dow", name: "다우존스", shortName: "DOW", provider: "yahoo", symbol: "^DJI", unit: "pt" },
  { id: "russell", name: "러셀 2000", shortName: "RUSSELL 2000", provider: "yahoo", symbol: "^RUT", unit: "pt" },
  { id: "sox", name: "필라델피아 반도체", shortName: "SOX", provider: "yahoo", symbol: "^SOX", unit: "pt" },
  { id: "usdkrw", name: "달러 / 원", shortName: "USD/KRW", provider: "yahoo", symbol: "KRW=X", unit: "원" },
  { id: "vix", name: "VIX 변동성 지수", shortName: "VIX", provider: "yahoo", symbol: "^VIX", unit: "pt" },
];

function value(input: unknown): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function fetchDomesticIndex(code: string): Promise<DailyRow[]> {
  const pages = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      fetch(
        `https://m.stock.naver.com/front-api/stock/domestic/index/price/list?code=${encodeURIComponent(code)}&page=${index + 1}&pageSize=50`,
        { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, cache: "no-store" },
      ).then(async (response) => {
        if (!response.ok) throw new Error(`국내 지수 데이터를 불러오지 못했습니다. (${response.status})`);
        const payload = (await response.json()) as { result?: Array<DailyRow & { localTradedAt?: string }> };
        return payload.result ?? [];
      }),
    ),
  );
  return pages.flat().map((row) => ({
    ...row,
    localDate: String(row.localDate ?? row.localTradedAt ?? "").replaceAll("-", ""),
  }));
}

async function fetchYahoo(symbol: string): Promise<DailyRow[]> {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d&includePrePost=false`,
    { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`글로벌 지수 데이터를 불러오지 못했습니다. (${response.status})`);
  const payload = (await response.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<Record<string, Array<number | null>>> } }> };
  };
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) throw new Error("글로벌 지수 시세 형식이 올바르지 않습니다.");
  return result.timestamp.flatMap((timestamp, index) => {
    const open = value(quote.open?.[index]);
    const high = value(quote.high?.[index]);
    const low = value(quote.low?.[index]);
    const close = value(quote.close?.[index]);
    if (Math.min(open, high, low, close) <= 0) return [];
    return [{
      localDate: dateText(timestamp),
      openPrice: open,
      highPrice: high,
      lowPrice: low,
      closePrice: close,
      accumulatedTradingVolume: value(quote.volume?.[index]),
    }];
  });
}

function summarize(candles: ReturnType<typeof aggregateCandles>) {
  const current = candles.at(-1)?.close;
  const previous = candles.at(-2)?.close;
  if (current === undefined || previous === undefined || previous <= 0) return null;
  return { current, previous, change: current - previous, changePct: ((current - previous) / previous) * 100 };
}

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const params = new URL(request.url).searchParams;
    const watch = MARKET_WATCHES.find((item) => item.id === params.get("id"));
    if (!watch) return NextResponse.json({ error: "지원하지 않는 시장 지표입니다." }, { status: 400 });
    const timeframeValue = params.get("timeframe");
    const timeframe: ChartTimeframe =
      timeframeValue === "daily" || timeframeValue === "monthly" ? timeframeValue : "weekly";
    const daily = watch.provider === "naver-index" ? await fetchDomesticIndex(watch.symbol) : await fetchYahoo(watch.symbol);
    const points = withMovingAverages(aggregateCandles(daily, timeframe));
    return NextResponse.json({
      watch,
      points: points.slice(-360),
      changes: {
        daily: summarize(aggregateCandles(daily, "daily")),
        weekly: summarize(aggregateCandles(daily, "weekly")),
        monthly: summarize(aggregateCandles(daily, "monthly")),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시장 지표 데이터를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
