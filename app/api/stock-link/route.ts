import { NextResponse } from "next/server";

const SUPPORTED_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX"]);

function yahooStockUrl(code: string) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(code)}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = String(params.get("code") ?? "").toUpperCase();
  const market = String(params.get("market") ?? "").toUpperCase();

  if (!SUPPORTED_EXCHANGES.has(market) || !/^[A-Z.\-]{1,12}$/.test(code)) {
    return NextResponse.redirect("https://finance.yahoo.com/markets/stocks/", 302);
  }

  const naverUrl = `https://finance.naver.com/world/sise.naver?symbol=${encodeURIComponent(`${market}:${code}`)}`;
  try {
    const response = await fetch(naverUrl, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      cache: "no-store",
    });
    const html = await response.text();
    if (response.ok && !html.includes("존재하지 않는 종목")) {
      return NextResponse.redirect(naverUrl, 302);
    }
  } catch {
    // A direct Yahoo Finance link is preferable to an error page if Naver is unavailable.
  }

  return NextResponse.redirect(yahooStockUrl(code), 302);
}
