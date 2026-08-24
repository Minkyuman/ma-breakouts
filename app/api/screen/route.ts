import { NextResponse } from "next/server";
import {
  screenTicker,
  fetchUsdKrwRate,
  fetchNasdaq100Membership,
  type Candidate,
  type MovingAveragePeriod,
  type ScreeningMaPeriod,
  type ScreeningTimeframe,
  type Ticker,
  type Timeframe,
} from "@/lib/market";

type ScreenRequest = {
  tickers?: Ticker[];
  timeframe?: ScreeningTimeframe;
  maPeriod?: ScreeningMaPeriod;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScreenRequest;
    const tickers = Array.isArray(body.tickers) ? body.tickers.slice(0, 30) : [];
    const timeframe: ScreeningTimeframe =
      body.timeframe === "monthly" || body.timeframe === "both" ? body.timeframe : "weekly";
    const maPeriod: ScreeningMaPeriod =
      body.maPeriod === 240 || body.maPeriod === "both" ? body.maPeriod : 10;
    const timeframes: Timeframe[] = timeframe === "both" ? ["weekly", "monthly"] : [timeframe];
    const maPeriods: MovingAveragePeriod[] = maPeriod === "both" ? [10, 240] : [maPeriod];
    if (!tickers.length) {
      return NextResponse.json({ error: "분석할 종목이 없습니다." }, { status: 400 });
    }
    let matches: Candidate[] = [];
    let failures = 0;

    const groups = await Promise.all(
      tickers.map(async (ticker) => {
        const conditions = timeframes.flatMap((period) =>
          maPeriods.map((movingAverage) => ({ period, movingAverage })),
        );
        const settled = await Promise.allSettled(
          conditions.map(({ period, movingAverage }) =>
            screenTicker(ticker, period, movingAverage),
          ),
        );
        const groupFailures = settled.filter((result) => result.status === "rejected").length;
        const values = settled.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : [],
        );
        const allMatched = groupFailures === 0 && values.length === conditions.length;
        const primary = values[0];
        const match =
          allMatched && primary
            ? {
                ...primary,
                matchedTimeframes: timeframes.length > 1 ? timeframes : undefined,
                matchedMaPeriods: maPeriods.length > 1 ? maPeriods : undefined,
              }
            : null;
        return { match, groupFailures };
      }),
    );
    matches = groups.flatMap((group) => (group.match ? [group.match] : []));
    failures = groups.reduce((sum, group) => sum + group.groupFailures, 0);
    const hasUsdMatches = matches.some((item) => item.currency === "USD");
    const exchangeRate = hasUsdMatches ? await fetchUsdKrwRate() : undefined;
    if (exchangeRate) {
      matches = matches.map((item) => item.currency === "USD"
        ? { ...item, exchangeRate, krwPrice: item.price * exchangeRate }
        : item);
    }
    const usMatches = matches.filter((item) => item.currency === "USD");
    const memberships = await Promise.allSettled(
      usMatches.map(async (item) => ({ code: item.code, isNasdaq100: await fetchNasdaq100Membership(item.code) })),
    );
    const membershipByCode = new Map(memberships.flatMap((result) => result.status === "fulfilled" ? [[result.value.code, result.value.isNasdaq100] as const] : []));
    matches = matches.map((item) => item.currency === "USD"
      ? { ...item, isNasdaq100: membershipByCode.get(item.code) ?? false }
      : item);
    return NextResponse.json({
      matches,
      failures,
      processed: tickers.length,
      analyzedSignals: tickers.length * timeframes.length * maPeriods.length,
      timeframe,
      maPeriod,
      exchangeRate,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배치 분석에 실패했습니다." },
      { status: 502 },
    );
  }
}
