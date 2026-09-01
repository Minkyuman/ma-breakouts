import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { analyzeStock } from "@/lib/stock-analysis";
import type { Market } from "@/lib/market";

const MARKETS = new Set<Market>(["KOSPI", "KOSDAQ", "NASDAQ", "NYSE", "AMEX", "US_ETF"]);

// Two research agents run in parallel before the final editor. Keep enough
// headroom for a grounded report while the UI remains cancellable.
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  try {
    const input = await request.json() as { code?: unknown; market?: unknown };
    const code = String(input.code ?? "").trim().toUpperCase();
    const market = String(input.market ?? "").trim().toUpperCase() as Market;
    const korean = market === "KOSPI" || market === "KOSDAQ";
    // Korean ETFs can have six-character alphanumeric issue codes (e.g. 0101N0),
    // which are valid in the Naver market universe and chart endpoints.
    const validCode = korean ? /^[A-Z0-9]{6}$/.test(code) : /^[A-Z.-]{1,12}$/.test(code);
    if (!validCode || !MARKETS.has(market)) {
      return NextResponse.json({ error: "분석할 종목코드와 시장을 확인해 주세요." }, { status: 400 });
    }
    const analysis = await analyzeStock(code, market);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "종목 심층분석에 실패했습니다.";
    console.error(JSON.stringify({ service: "line-breaker-analysis", event: "analysis.failed", details: message }));
    const timedOut = /aborted due to timeout|timeout/iu.test(message);
    const status = timedOut ? 504 : message.includes("설정되지") ? 503 : 502;
    const safeMessage = timedOut
      ? "선택한 AI 모델의 응답 시간이 초과됐습니다. 잠시 후 다시 시도하거나 운영에서 다른 모델을 선택해 주세요."
      : message.startsWith("Failed query:")
      ? "AI 분석 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
      : message;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
