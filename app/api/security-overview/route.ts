import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";
import { strFromU8, unzipSync } from "fflate";

type NewsItem = { id: string; title: string; office: string; publishedAt: string | null; url: string };
let dartCorpCodes: { expiresAt: number; map: Map<string, string> } | null = null;

function clean(value: unknown) {
  return String(value ?? "").replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim();
}

function dateFromNaver(value: unknown) {
  const compact = String(value ?? "");
  return /^\d{12}$/u.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)} ${compact.slice(8, 10)}:${compact.slice(10, 12)}` : null;
}

async function loadDartDescription(code: string): Promise<string | null> {
  const apiKey = process.env.OPENDART_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    if (!dartCorpCodes || dartCorpCodes.expiresAt < Date.now()) {
      const response = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
      if (!response.ok) return null;
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const xml = strFromU8(files["CORPCODE.xml"] ?? new Uint8Array());
      const map = new Map<string, string>();
      for (const item of xml.matchAll(/<list>([\s\S]*?)<\/list>/gu)) {
        const stockCode = item[1].match(/<stock_code>\s*(\d{6})\s*<\/stock_code>/u)?.[1];
        const corpCode = item[1].match(/<corp_code>(\d+)<\/corp_code>/u)?.[1];
        if (stockCode && corpCode) map.set(stockCode, corpCode);
      }
      dartCorpCodes = { expiresAt: Date.now() + 24 * 60 * 60_000, map };
    }
    const corpCode = dartCorpCodes.map.get(code);
    if (!corpCode) return null;
    const response = await fetch(`https://opendart.fss.or.kr/api/company.json?crtfc_key=${encodeURIComponent(apiKey)}&corp_code=${corpCode}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { status?: string; corp_name?: string; ceo_nm?: string; induty_code_nm?: string; adres?: string; est_dt?: string; hm_url?: string };
    if (payload.status !== "000" || !payload.corp_name) return null;
    const details = [payload.induty_code_nm, payload.ceo_nm ? `대표 ${payload.ceo_nm}` : null, payload.est_dt ? `설립 ${payload.est_dt}` : null].filter(Boolean).join(" · ");
    return details ? `${payload.corp_name}은(는) ${details}인 기업입니다.` : `${payload.corp_name}의 DART 기업 개요입니다.`;
  } catch {
    return null;
  }
}

async function loadKoreanNews(code: string): Promise<NewsItem[]> {
  const response = await fetch(`https://m.stock.naver.com/api/news/stock/${encodeURIComponent(code)}?pageSize=5&page=1`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as Array<{ items?: Array<{ id?: string; title?: string; titleFull?: string; officeName?: string; datetime?: string; mobileNewsUrl?: string; officeId?: string; articleId?: string }> }>;
  return payload.flatMap((group) => group.items ?? []).flatMap((item) => {
    const title = clean(item.titleFull || item.title);
    const url = item.mobileNewsUrl || (item.officeId && item.articleId ? `https://n.news.naver.com/mnews/article/${item.officeId}/${item.articleId}` : "");
    if (!title || !url) return [];
    return [{ id: item.id || url, title, office: clean(item.officeName) || "네이버 증권", publishedAt: dateFromNaver(item.datetime), url }];
  }).slice(0, 4);
}

async function loadUsNews(code: string): Promise<NewsItem[]> {
  const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(code)}&newsCount=5&quotesCount=0`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as { news?: Array<{ uuid?: string; title?: string; publisher?: string; link?: string; providerPublishTime?: number }> };
  return (payload.news ?? []).flatMap((item) => item.title && item.link ? [{ id: item.uuid || item.link, title: clean(item.title), office: clean(item.publisher) || "Yahoo Finance", publishedAt: Number.isFinite(item.providerPublishTime) ? new Date(item.providerPublishTime! * 1000).toISOString() : null, url: item.link }] : []).slice(0, 4);
}

async function loadDescription(code: string, market: string): Promise<string | null> {
  if (market === "KOSPI" || market === "KOSDAQ") {
    const response = await fetch(`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(code)}`, { headers: { accept: "text/html", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!response.ok) return null;
    const html = await response.text();
    const summary = html.match(/<div id="summary_info"[\s\S]*?<div class="txt_notice">/)?.[0] ?? "";
    const text = clean(summary)
      .replace(/^기업개요\s*/u, "")
      .replace(/^동사는\s*/u, "");
    return text ? text.slice(0, 260) : loadDartDescription(code);
  }
  if (market === "NASDAQ" || market === "NYSE" || market === "AMEX" || market === "US_ETF") {
    const response = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(code.toLowerCase())}/company-profile`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { data?: { CompanyDescription?: { value?: string } } };
    const text = clean(payload.data?.CompanyDescription?.value);
    return text ? text.slice(0, 260) : null;
  }
  return null;
}

export async function GET(request: Request) {
  if (!(await getSession(request))) return unauthorized();
  const params = new URL(request.url).searchParams;
  const code = String(params.get("code") ?? "").trim().toUpperCase();
  const market = String(params.get("market") ?? "").toUpperCase();
  if (!code) return NextResponse.json({ error: "종목코드가 필요합니다." }, { status: 400 });
  try {
    const [news, description] = await Promise.all([
      market === "KOSPI" || market === "KOSDAQ" ? loadKoreanNews(code) : market === "NASDAQ" || market === "NYSE" || market === "AMEX" || market === "US_ETF" ? loadUsNews(code) : [],
      loadDescription(code, market).catch(() => null),
    ]);
    return NextResponse.json({ news, description }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ news: [] }, { headers: { "cache-control": "public, s-maxage=60" } });
  }
}
