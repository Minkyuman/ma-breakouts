import {
  aggregateCandles,
  fetchSecurityClassification,
  fetchTickerDailyChart,
  fetchUniverse,
  fetchUsdKrwRate,
  fetchUsUniverse,
  withMovingAverages,
  type ChartPoint,
  type Market,
  type Ticker,
} from "@/lib/market";
import { strFromU8, unzipSync } from "fflate";
import { analysisModelSuggestions, DEFAULT_ANALYSIS_MODEL, getConfiguredAnalysisModel } from "@/lib/analysis-model-settings";

export const STOCK_ANALYSIS_SECTION_ORDER = [
  "executive_summary",
  "business_reality",
  "macro_context",
  "technical_analysis",
  "fundamental_analysis",
  "catalyst_watch",
  "action_plan",
] as const;

export type StockAnalysisSectionId = (typeof STOCK_ANALYSIS_SECTION_ORDER)[number];

export type StockAnalysisSection = {
  id: StockAnalysisSectionId;
  title: string;
  summary: string;
  bullets: string[];
  sourceIds: string[];
};

/** A small, auditable fact used by the analysis. Values are collected server-side. */
export type AnalysisEvidenceCard = {
  id: string;
  category: "price" | "technical" | "fundamental" | "market" | "company";
  claim: string;
  value: string;
  period: string | null;
  asOf: string | null;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceTier: "primary" | "market" | "derived";
};

export type AnalysisQuality = {
  score: number;
  citationCoveragePct: number;
  evidenceCount: number;
  primaryEvidenceCount: number;
  issues: string[];
};

export type FundamentalMetric = {
  label: string;
  value: number;
  unit: string;
};

export type FundamentalSnapshot = {
  period: string;
  asOf: string | null;
  source: { title: string; url: string };
  metrics: FundamentalMetric[];
};

export type MarketIntelligence = {
  asOf: string | null;
  source: { title: string; url: string };
  investor: { foreignToday: number | null; institutionToday: number | null; foreignFiveDay: number | null; institutionFiveDay: number | null; foreignBuyDays: number; institutionBuyDays: number; foreignHoldingPct: number | null } | null;
  consensus: { rating: number | null; targetPrice: number | null; asOf: string | null } | null;
  researches: Array<{ broker: string; title: string; date: string | null }>;
  recentNews: Array<{ id: string; title: string; summary: string; office: string; publishedAt: string | null; url: string; directMention: boolean }>;
};

export type ConvertibleOverhang = {
  asOf: string;
  source: { title: string; url: string };
  instruments: Array<{
    kind: "CB" | "BW";
    receiptNo: string;
    reportDate: string;
    amount: number | null;
    exercisePrice: number | null;
    potentialShares: number | null;
    exerciseStart: string | null;
    exerciseEnd: string | null;
    refixingFloor: number | null;
    sourceUrl: string;
  }>;
  totalPotentialShares: number;
  totalNominalAmount: number;
  dilutionPct: number | null;
  volumeDays: number | null;
  inTheMoneyCount: number;
  dataQuality: "verified_issuance_terms" | "not_found";
};

export type StockDeepAnalysis = {
  security: {
    code: string;
    name: string;
    market: Market;
    currency: "KRW" | "USD";
    marketCap: number | null;
  };
  opinion: "STRONG_BUY" | "BUY" | "HOLD" | "SELL";
  oneLineConclusion: string;
  confidence: number;
  prices: {
    entry: number | null;
    target: number | null;
    stop: number | null;
    currency: "KRW" | "USD";
    method: string;
  };
  fundamentals: FundamentalSnapshot | null;
  marketIntelligence: MarketIntelligence | null;
  convertibleOverhang: ConvertibleOverhang | null;
  sections: StockAnalysisSection[];
  scenarios: Array<{
    name: string;
    probabilityPct: number;
    targetPrice: number | null;
    stopPrice: number | null;
    rationale: string;
  }>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publishedAt: string | null;
  }>;
  evidence: AnalysisEvidenceCard[];
  quality: AnalysisQuality;
  missingData: string[];
  disclaimer: string;
  generatedAt: string;
  model: string;
  cached: boolean;
};

type OpenRouterCitation = {
  type?: string;
  url_citation?: { url?: string; title?: string; content?: string };
};

type OpenRouterResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
      annotations?: OpenRouterCitation[];
    };
  }>;
};

type ResearchAgentBrief = {
  role: "research_scout" | "risk_reviewer";
  findings: Array<{
    claim: string;
    evidence: string;
    sourceUrls: string[];
    importance: "high" | "medium" | "low";
  }>;
  openQuestions: string[];
  thesis: string[];
  counterThesis: string[];
};

type RawAnalysis = Omit<StockDeepAnalysis, "security" | "fundamentals" | "marketIntelligence" | "convertibleOverhang" | "evidence" | "quality" | "generatedAt" | "model" | "cached">;

const ANALYSIS_CACHE_MS = 30 * 60_000;
const analysisCache = new Map<string, { expiresAt: number; analysis: StockDeepAnalysis }>();
const analysisRequests = new Map<string, Promise<StockDeepAnalysis>>();

const sectionTitles: Record<StockAnalysisSectionId, string> = {
  executive_summary: "1. Executive Summary · 핵심 요약",
  business_reality: "2. Business Reality Check · 사업 구조 실체",
  macro_context: "3. Macro & Geopolitical Context · 거시환경",
  technical_analysis: "4. Technical Analysis · 수급과 차트",
  fundamental_analysis: "5. Fundamental Analysis · 실적과 가치",
  catalyst_watch: "6. Catalyst Watch · 재료와 리스크",
  action_plan: "7. Action Plan · 대응 전략",
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    opinion: { type: "string", enum: ["STRONG_BUY", "BUY", "HOLD", "SELL"] },
    oneLineConclusion: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    prices: {
      type: "object",
      additionalProperties: false,
      properties: {
        entry: { type: ["number", "null"] },
        target: { type: ["number", "null"] },
        stop: { type: ["number", "null"] },
        currency: { type: "string", enum: ["KRW", "USD"] },
        method: { type: "string" },
      },
      required: ["entry", "target", "stop", "currency", "method"],
    },
    sections: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: STOCK_ANALYSIS_SECTION_ORDER },
          title: { type: "string" },
          summary: { type: "string" },
          bullets: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "summary", "bullets", "sourceIds"],
      },
    },
    scenarios: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          probabilityPct: { type: "number", minimum: 0, maximum: 100 },
          targetPrice: { type: ["number", "null"] },
          stopPrice: { type: ["number", "null"] },
          rationale: { type: "string" },
        },
        required: ["name", "probabilityPct", "targetPrice", "stopPrice", "rationale"],
      },
    },
    sources: {
      type: "array", maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          publishedAt: { type: ["string", "null"] },
        },
        required: ["id", "title", "url", "publishedAt"],
      },
    },
    missingData: { type: "array", maxItems: 8, items: { type: "string" } },
    disclaimer: { type: "string" },
  },
  required: ["opinion", "oneLineConclusion", "confidence", "prices", "sections", "scenarios", "sources", "missingData", "disclaimer"],
} as const;

const researchAgentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    role: { type: "string", enum: ["research_scout", "risk_reviewer"] },
    findings: {
      type: "array", maxItems: 8, items: {
        type: "object", additionalProperties: false,
        properties: {
          claim: { type: "string" }, evidence: { type: "string" }, sourceUrls: { type: "array", maxItems: 3, items: { type: "string" } },
          importance: { type: "string", enum: ["high", "medium", "low"] },
        }, required: ["claim", "evidence", "sourceUrls", "importance"],
      },
    },
    openQuestions: { type: "array", maxItems: 6, items: { type: "string" } },
    thesis: { type: "array", maxItems: 5, items: { type: "string" } },
    counterThesis: { type: "array", maxItems: 5, items: { type: "string" } },
  },
  required: ["role", "findings", "openQuestions", "thesis", "counterThesis"],
} as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(current: number | undefined, previous: number | undefined) {
  return current !== undefined && previous !== undefined && previous > 0
    ? Number((((current - previous) / previous) * 100).toFixed(2))
    : null;
}

function pointSummary(points: ChartPoint[]) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  if (!latest) return null;
  return {
    date: latest.date,
    close: latest.close,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    changePct: percent(latest.close, previous?.close),
    volumeChangePct: percent(latest.volume, previous?.volume),
    ma5: latest.ma5,
    ma10: latest.ma10,
    ma240: latest.ma240,
    gapFromMa10Pct: latest.ma10 ? percent(latest.close, latest.ma10) : null,
    gapFromMa240Pct: latest.ma240 ? percent(latest.close, latest.ma240) : null,
  };
}

function rangeSummary(points: ChartPoint[], periods: number) {
  const rows = points.slice(-periods);
  if (!rows.length) return null;
  return {
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
    averageVolume: Math.round(rows.reduce((sum, row) => sum + row.volume, 0) / rows.length),
  };
}

async function resolveTicker(codeValue: string, market: Market): Promise<Ticker> {
  const code = codeValue.trim().toUpperCase();
  const korean = market === "KOSPI" || market === "KOSDAQ";
  const universe = korean
    ? await fetchUniverse(market.toLowerCase() as "kospi" | "kosdaq", "all")
    : market === "US_ETF"
      ? await fetchUsUniverse("all", "etp")
      : await fetchUsUniverse(market.toLowerCase() as "nasdaq" | "nyse" | "amex", "stock");
  const ticker = universe.find((item) => item.code === code && item.market === market);
  if (!ticker) throw new Error("분석할 종목을 시장 목록에서 확인하지 못했습니다.");
  return ticker;
}

function knownSources(ticker: Ticker) {
  const korean = ticker.market === "KOSPI" || ticker.market === "KOSDAQ";
  return korean
    ? [
        { id: "M1", title: "네이버페이 증권 종목 정보", url: `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(ticker.code)}/total`, publishedAt: null },
        { id: "F1", title: "금융감독원 전자공시시스템 DART", url: "https://dart.fss.or.kr/", publishedAt: null },
      ]
    : [
        { id: "M1", title: "Nasdaq 종목 정보", url: `https://www.nasdaq.com/market-activity/${ticker.assetType === "ETF" ? "etf" : "stocks"}/${encodeURIComponent(ticker.code.toLowerCase())}`, publishedAt: null },
        { id: "F1", title: "SEC EDGAR Company Filings", url: "https://www.sec.gov/edgar/search/", publishedAt: null },
      ];
}

function numberValue(value: unknown): number | null {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized.replace(/[$%]/gu, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

type KoreanFinanceResponse = {
  financeInfo?: {
    trTitleList?: Array<{ isConsensus?: string; title?: string; key?: string }>;
    rowList?: Array<{ title?: string; columns?: Record<string, { value?: string }> }>;
  };
};

async function fetchKoreanFundamentals(ticker: Ticker): Promise<FundamentalSnapshot | null> {
  const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(ticker.code)}/finance/annual`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as KoreanFinanceResponse;
  const periods = payload.financeInfo?.trTitleList ?? [];
  const period = [...periods].reverse().find((item) => item.isConsensus !== "Y" && item.key);
  if (!period?.key || !period.title) return null;
  const rows = new Map((payload.financeInfo?.rowList ?? []).map((row) => [row.title, numberValue(row.columns?.[period.key!]?.value)]));
  const metrics: Array<[string, string, string]> = [
    ["PER", "PER", "배"], ["PBR", "PBR", "배"], ["EPS", "EPS", "원"], ["BPS", "BPS", "원"],
    ["ROE", "ROE", "%"], ["영업이익률", "영업이익률", "%"], ["부채비율", "부채비율", "%"],
    ["매출액", "매출액", "억원"], ["영업이익", "영업이익", "억원"], ["당기순이익", "당기순이익", "억원"],
  ];
  const verified = metrics.flatMap(([label, key, unit]) => {
    const value = rows.get(key);
    return value === null || value === undefined ? [] : [{ label, value, unit }];
  });
  return verified.length ? {
    period: `연간 ${period.title.replace(/\.$/u, "")}`,
    asOf: period.title.replace(/\.$/u, ""),
    source: { title: "네이버페이 증권 연간 재무", url },
    metrics: verified,
  } : null;
}

type YahooTimeseriesResponse = {
  timeseries?: { result?: Array<Record<string, unknown>> };
};

type SecTickerDirectory = Record<string, { cik_str?: number; ticker?: string }>;
type SecCompanyFacts = {
  facts?: Record<string, Record<string, { units?: Record<string, Array<{
    val?: number;
    fy?: number;
    fp?: string;
    form?: string;
    filed?: string;
    end?: string;
  }>> }>>;
};
type SecSubmissions = {
  filings?: { recent?: {
    form?: string[];
    accessionNumber?: string[];
    filingDate?: string[];
    reportDate?: string[];
    primaryDocument?: string[];
  } };
};
type SecFiling = { form: "10-K" | "10-Q" | "8-K"; filingDate: string; reportDate: string | null; url: string };
type UsPeerSnapshot = { symbol: string; fundamentals: FundamentalSnapshot };

let secTickerDirectoryCache: { expiresAt: number; rows: SecTickerDirectory } | null = null;

function secHeaders() {
  // SEC asks automated clients to identify themselves. Keep the optional
  // contact server-only and do not expose it in the browser payload.
  return {
    accept: "application/json",
    "user-agent": process.env.SEC_API_USER_AGENT?.trim() || "LINE BREAKER research contact@linebreaker.app",
  };
}

async function findSecCik(symbol: string) {
  if (!secTickerDirectoryCache || secTickerDirectoryCache.expiresAt < Date.now()) {
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: secHeaders(), cache: "no-store" });
    if (!response.ok) return null;
    secTickerDirectoryCache = { expiresAt: Date.now() + 24 * 60 * 60_000, rows: await response.json() as SecTickerDirectory };
  }
  const match = Object.values(secTickerDirectoryCache.rows).find((row) => row.ticker?.toUpperCase() === symbol.toUpperCase());
  return match?.cik_str ? String(match.cik_str).padStart(10, "0") : null;
}

function latestSecFact(facts: SecCompanyFacts, tag: string) {
  const units = facts.facts?.["us-gaap"]?.[tag]?.units ?? {};
  const candidates = Object.values(units)
    .flat()
    .filter((row) => Number.isFinite(row.val) && (row.form === "10-K" || row.form === "10-Q"))
    .sort((a, b) => String(a.filed ?? "").localeCompare(String(b.filed ?? "")));
  return candidates.at(-1) ?? null;
}

async function fetchSecFundamentals(ticker: Ticker): Promise<FundamentalSnapshot | null> {
  const cik = await findSecCik(ticker.code);
  if (!cik) return null;
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const response = await fetch(url, { headers: secHeaders(), cache: "no-store" });
  if (!response.ok) return null;
  const facts = await response.json() as SecCompanyFacts;
  const definitions: Array<[string, string, string]> = [
    ["매출액", "Revenues", "USD"],
    ["매출액", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD"],
    ["영업이익", "OperatingIncomeLoss", "USD"],
    ["순이익", "NetIncomeLoss", "USD"],
    ["희석 EPS", "EarningsPerShareDiluted", "USD"],
    ["총부채", "LongTermDebtAndFinanceLeaseObligationsCurrent", "USD"],
  ];
  const seen = new Set<string>();
  const collected = definitions.flatMap(([label, tag, unit]) => {
    if (seen.has(label)) return [];
    const fact = latestSecFact(facts, tag);
    if (!fact || !finite(fact.val)) return [];
    seen.add(label);
    return [{ label, value: fact.val, unit, asOf: fact.end ?? fact.filed ?? null, period: fact.fp ?? "최근 공시" }];
  });
  if (!collected.length) return null;
  const asOf = collected.map((entry) => entry.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    period: collected.find((entry) => entry.period)?.period ?? "최근 SEC 공시",
    asOf,
    source: { title: "SEC EDGAR XBRL Company Facts", url },
    metrics: collected.map(({ label, value, unit }) => ({ label, value, unit })),
  };
}

async function fetchSecFilings(ticker: Ticker): Promise<SecFiling[]> {
  const cik = await findSecCik(ticker.code);
  if (!cik) return [];
  const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: secHeaders(), cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as SecSubmissions;
  const recent = payload.filings?.recent;
  const forms = recent?.form ?? [];
  const accessionNumbers = recent?.accessionNumber ?? [];
  const filingDates = recent?.filingDate ?? [];
  const reportDates = recent?.reportDate ?? [];
  const documents = recent?.primaryDocument ?? [];
  const found: SecFiling[] = [];
  const countByForm = new Map<string, number>();
  for (let index = 0; index < forms.length; index += 1) {
    const form = forms[index];
    if (form !== "10-K" && form !== "10-Q" && form !== "8-K") continue;
    const count = countByForm.get(form) ?? 0;
    const limit = form === "8-K" ? 2 : 1;
    if (count >= limit || !accessionNumbers[index] || !documents[index]) continue;
    countByForm.set(form, count + 1);
    found.push({
      form,
      filingDate: filingDates[index] ?? "",
      reportDate: reportDates[index] || null,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNumbers[index].replaceAll("-", "")}/${documents[index]}`,
    });
    if (countByForm.get("10-K") && countByForm.get("10-Q") && (countByForm.get("8-K") ?? 0) >= 2) break;
  }
  return found;
}

const US_PEER_GROUPS: Array<{ pattern: RegExp; symbols: string[] }> = [
  { pattern: /alternative asset|asset management|private equity/iu, symbols: ["BX", "APO", "ARES"] },
  { pattern: /semiconductor|chip|gpu/iu, symbols: ["NVDA", "AMD", "AVGO"] },
  { pattern: /electrical equipment|power equipment|grid/iu, symbols: ["ETN", "HUBB", "GEV"] },
  { pattern: /software|application|saas/iu, symbols: ["MSFT", "ORCL", "CRM"] },
  { pattern: /bank|financial services/iu, symbols: ["JPM", "BAC", "GS"] },
  { pattern: /oil|energy|exploration/iu, symbols: ["XOM", "CVX", "COP"] },
];

function usPeerSymbols(ticker: Ticker, classification: { sector?: string; industry?: string }) {
  const text = `${ticker.name} ${ticker.code} ${classification.sector ?? ""} ${classification.industry ?? ""}`.toLowerCase();
  const group = US_PEER_GROUPS.find((candidate) => candidate.pattern.test(text));
  return (group?.symbols ?? []).filter((symbol) => symbol !== ticker.code).slice(0, 3);
}

async function fetchUsPeerSnapshots(ticker: Ticker, classification: { sector?: string; industry?: string }): Promise<UsPeerSnapshot[]> {
  const symbols = usPeerSymbols(ticker, classification);
  return (await Promise.all(symbols.map(async (symbol) => {
    const fundamentals = await fetchSecFundamentals({ ...ticker, code: symbol, name: symbol }).catch(() => null);
    return fundamentals ? { symbol, fundamentals } : null;
  }))).filter((entry): entry is UsPeerSnapshot => entry !== null);
}

async function fetchYahooMetric(symbol: string, type: string) {
  const end = Math.floor(Date.now() / 1000) + 86_400;
  const start = end - 5 * 365 * 86_400;
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${encodeURIComponent(type)}&period1=${start}&period2=${end}`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as YahooTimeseriesResponse;
  const row = payload.timeseries?.result?.[0]?.[type] as Array<{ asOfDate?: string; periodType?: string; reportedValue?: { raw?: number } }> | undefined;
  const latest = row?.at(-1);
  return latest?.reportedValue && finite(latest.reportedValue.raw)
    ? { value: latest.reportedValue.raw, asOf: latest.asOfDate ?? null, period: latest.periodType ?? null }
    : null;
}

async function fetchUsFundamentals(ticker: Ticker): Promise<FundamentalSnapshot | null> {
  const secFundamentals = await fetchSecFundamentals(ticker).catch(() => null);
  if (secFundamentals) return secFundamentals;
  const sourceUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker.code)}/financials`;
  const entries = await Promise.all([
    ["PER (TTM)", "trailingPeRatio", "배"], ["EPS (TTM)", "trailingDilutedEPS", "USD"],
    ["매출액 (TTM)", "trailingTotalRevenue", "USD"], ["영업이익 (TTM)", "trailingOperatingIncome", "USD"],
    ["순이익 (TTM)", "trailingNetIncome", "USD"], ["총부채", "annualTotalDebt", "USD"],
  ].map(async ([label, type, unit]) => {
    const result = await fetchYahooMetric(ticker.code, type);
    return result ? { label, unit, ...result } : null;
  }));
  const verified = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (!verified.length) return null;
  const asOf = verified.map((entry) => entry.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return {
    period: verified.find((entry) => entry.period)?.period ?? "최근 공시 기준",
    asOf,
    source: { title: "Yahoo Finance 공개 재무 시계열", url: sourceUrl },
    metrics: verified.map(({ label, value, unit }) => ({ label, value, unit })),
  };
}

async function fetchFundamentals(ticker: Ticker) {
  if (ticker.assetType !== "STOCK") return null;
  return ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
    ? fetchKoreanFundamentals(ticker).catch(() => null)
    : fetchUsFundamentals(ticker).catch(() => null);
}

type KoreanIntegrationResponse = {
  dealTrendInfos?: Array<{ bizdate?: string; foreignerPureBuyQuant?: string; organPureBuyQuant?: string; foreignerHoldRatio?: string }>;
  consensusInfo?: { createDate?: string; recommMean?: string; priceTargetMean?: string };
  researches?: Array<{ bnm?: string; tit?: string; wdt?: string }>;
};

type NaverStockNewsResponse = Array<{ items?: Array<{
  id?: string;
  officeId?: string;
  articleId?: string;
  officeName?: string;
  datetime?: string;
  title?: string;
  titleFull?: string;
  body?: string;
  mobileNewsUrl?: string;
}> }>;

type YahooNewsSearchResponse = {
  news?: Array<{
    uuid?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    relatedTickers?: string[];
  }>;
};

function plainText(value: string | undefined) {
  return (value ?? "").replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim();
}

function naverNewsDate(value: string | undefined) {
  const compact = String(value ?? "");
  return /^\d{12}$/u.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)} ${compact.slice(8, 10)}:${compact.slice(10, 12)}`
    : null;
}

async function fetchKoreanRecentNews(ticker: Ticker) {
  const url = `https://m.stock.naver.com/api/news/stock/${encodeURIComponent(ticker.code)}?pageSize=20&page=1`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as NaverStockNewsResponse;
  const companyName = ticker.name.replace(/\s+/gu, "").toLowerCase();
  const seen = new Set<string>();
  return payload.flatMap((group) => group.items ?? []).flatMap((item) => {
    const title = plainText(item.titleFull || item.title);
    const id = item.id || `${item.officeId ?? ""}:${item.articleId ?? ""}`;
    const url = item.mobileNewsUrl || (item.officeId && item.articleId ? `https://n.news.naver.com/mnews/article/${item.officeId}/${item.articleId}` : "");
    if (!id || !title || !url || seen.has(id)) return [];
    seen.add(id);
    const searchable = `${title} ${plainText(item.body)}`.replace(/\s+/gu, "").toLowerCase();
    return [{ id, title, summary: plainText(item.body).slice(0, 360), office: plainText(item.officeName) || "네이버 뉴스", publishedAt: naverNewsDate(item.datetime), url, directMention: companyName.length > 1 && searchable.includes(companyName) }];
  }).slice(0, 10);
}

/** Yahoo's ticker search feed is used for US stock and ETF ticker-linked headlines.
 *  Headlines remain market-tier evidence; SEC filings are kept as primary evidence. */
async function fetchUsRecentNews(ticker: Ticker) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker.code)}&newsCount=20&quotesCount=0`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as YahooNewsSearchResponse;
  const symbol = ticker.code.toUpperCase();
  const companyName = ticker.name.replace(/\s+/gu, "").toLowerCase();
  const seen = new Set<string>();
  return (payload.news ?? []).flatMap((item) => {
    const id = item.uuid ?? item.link ?? "";
    const title = plainText(item.title);
    const url = item.link ?? "";
    if (!id || !title || !url || seen.has(id)) return [];
    seen.add(id);
    const directMention = item.relatedTickers?.some((related) => related.toUpperCase() === symbol)
      ?? `${title}`.replace(/\s+/gu, "").toLowerCase().includes(companyName);
    return [{
      id,
      title,
      summary: title,
      office: plainText(item.publisher) || "Yahoo Finance",
      publishedAt: Number.isFinite(item.providerPublishTime) ? new Date(item.providerPublishTime! * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, " UTC") : null,
      url,
      directMention,
    }];
  }).filter((item) => item.directMention).slice(0, 10);
}

async function fetchUsMarketIntelligence(ticker: Ticker): Promise<MarketIntelligence | null> {
  if (ticker.assetType === "INDEX") return null;
  const recentNews = await fetchUsRecentNews(ticker).catch(() => []);
  if (!recentNews.length) return null;
  return {
    asOf: recentNews[0]?.publishedAt ?? null,
    source: { title: "Yahoo Finance 티커 뉴스", url: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker.code)}/news` },
    investor: null,
    consensus: null,
    researches: [],
    recentNews,
  };
}

type DartDisclosure = { receiptNo: string; receiptDate: string; reportName: string; filerName: string; url: string };
type DartCorpCodeMap = Map<string, string>;
let dartCorpCodeCache: { expiresAt: number; map: DartCorpCodeMap } | null = null;

function dateCompact(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

async function loadDartCorpCodes(apiKey: string): Promise<DartCorpCodeMap> {
  if (dartCorpCodeCache && dartCorpCodeCache.expiresAt > Date.now()) return dartCorpCodeCache.map;
  const endpoint = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`OpenDART 법인코드 조회 실패 (${response.status})`);
  const xml = strFromU8(unzipSync(new Uint8Array(await response.arrayBuffer()))["CORPCODE.xml"] ?? new Uint8Array());
  const map: DartCorpCodeMap = new Map();
  for (const item of xml.matchAll(/<list>([\s\S]*?)<\/list>/gu)) {
    const corpCode = item[1].match(/<corp_code>(\d+)<\/corp_code>/u)?.[1];
    const stockCode = item[1].match(/<stock_code>\s*(\d{6})\s*<\/stock_code>/u)?.[1];
    if (corpCode && stockCode) map.set(stockCode, corpCode);
  }
  dartCorpCodeCache = { expiresAt: Date.now() + 24 * 60 * 60_000, map };
  return map;
}

async function fetchDartDisclosures(ticker: Ticker): Promise<DartDisclosure[]> {
  const apiKey = process.env.OPENDART_API_KEY?.trim();
  if (!apiKey || ticker.assetType !== "STOCK") return [];
  const corpCode = (await loadDartCorpCodes(apiKey)).get(ticker.code);
  if (!corpCode) return [];
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  const params = new URLSearchParams({
    crtfc_key: apiKey, corp_code: corpCode, bgn_de: dateCompact(start), end_de: dateCompact(end), page_count: "10",
  });
  const response = await fetch(`https://opendart.fss.or.kr/api/list.json?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as { status?: string; list?: Array<{ rcept_no?: string; rcept_dt?: string; report_nm?: string; flr_nm?: string }> };
  if (payload.status !== "000") return [];
  return (payload.list ?? []).flatMap((row) => row.rcept_no && row.report_nm ? [{
    receiptNo: row.rcept_no,
    receiptDate: row.rcept_dt ?? "",
    reportName: row.report_nm,
    filerName: row.flr_nm ?? ticker.name,
    url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.rcept_no)}`,
  }] : []);
}

type DartConvertibleDecision = {
  rcept_no?: string;
  bddd?: string;
  bd_fta?: string;
  cv_prc?: string;
  cvisstk_cnt?: string;
  cvrqpd_bgd?: string;
  cvrqpd_edd?: string;
  act_mktprcfl_cvprc_lwtrsprc?: string;
  ex_prc?: string;
  nstk_isstk_cnt?: string;
  expd_bgd?: string;
  expd_edd?: string;
  act_mktprcfl_cvprc_lwtrsprc?: string;
};

async function fetchDartConvertibleOverhang(ticker: Ticker, latestClose: number, averageVolume: number) : Promise<ConvertibleOverhang | null> {
  const apiKey = process.env.OPENDART_API_KEY?.trim();
  if (!apiKey || ticker.assetType !== "STOCK" || (ticker.market !== "KOSPI" && ticker.market !== "KOSDAQ")) return null;
  const corpCode = (await loadDartCorpCodes(apiKey)).get(ticker.code);
  if (!corpCode) return null;
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 5);
  const base = new URLSearchParams({ crtfc_key: apiKey, corp_code: corpCode, bgn_de: dateCompact(start), end_de: dateCompact(end) });
  const load = async (endpoint: string) => {
    const response = await fetch(`https://opendart.fss.or.kr/api/${endpoint}?${base.toString()}`, { cache: "no-store" });
    if (!response.ok) return [] as DartConvertibleDecision[];
    const payload = await response.json() as { status?: string; list?: DartConvertibleDecision[] };
    return payload.status === "000" ? (payload.list ?? []) : [];
  };
  const [cbRows, bwRows] = await Promise.all([load("cvbdIsDecsn.json"), load("bdwtIsDecsn.json")]);
  const instruments = [
    ...cbRows.map((row) => ({ kind: "CB" as const, amount: numberValue(row.bd_fta), exercisePrice: numberValue(row.cv_prc), potentialShares: numberValue(row.cvisstk_cnt), exerciseStart: row.cvrqpd_bgd ?? null, exerciseEnd: row.cvrqpd_edd ?? null, refixingFloor: numberValue(row.act_mktprcfl_cvprc_lwtrsprc), receiptNo: row.rcept_no ?? "", reportDate: row.bddd ?? "" })),
    ...bwRows.map((row) => ({ kind: "BW" as const, amount: numberValue(row.bd_fta), exercisePrice: numberValue(row.ex_prc), potentialShares: numberValue(row.nstk_isstk_cnt), exerciseStart: row.expd_bgd ?? null, exerciseEnd: row.expd_edd ?? null, refixingFloor: numberValue(row.act_mktprcfl_cvprc_lwtrsprc), receiptNo: row.rcept_no ?? "", reportDate: row.bddd ?? "" })),
  ].filter((row) => row.receiptNo && (row.amount !== null || row.potentialShares !== null)).slice(0, 20).map((row) => ({ ...row, sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(row.receiptNo)}` }));
  if (!instruments.length) return { asOf: end.toISOString().slice(0, 10), source: { title: "금융감독원 전자공시시스템 DART", url: "https://dart.fss.or.kr/" }, instruments: [], totalPotentialShares: 0, totalNominalAmount: 0, dilutionPct: null, volumeDays: null, inTheMoneyCount: 0, dataQuality: "not_found" };
  const totalPotentialShares = instruments.reduce((sum, row) => sum + (row.potentialShares ?? 0), 0);
  const totalNominalAmount = instruments.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const estimatedShares = ticker.marketCap && latestClose > 0 ? ticker.marketCap / latestClose : null;
  return { asOf: end.toISOString().slice(0, 10), source: { title: "금융감독원 전자공시시스템 DART", url: "https://dart.fss.or.kr/" }, instruments, totalPotentialShares, totalNominalAmount, dilutionPct: estimatedShares && totalPotentialShares ? Number((totalPotentialShares / estimatedShares * 100).toFixed(2)) : null, volumeDays: averageVolume > 0 && totalPotentialShares ? Number((totalPotentialShares / averageVolume).toFixed(1)) : null, inTheMoneyCount: instruments.filter((row) => row.exercisePrice !== null && latestClose > row.exercisePrice).length, dataQuality: "verified_issuance_terms" };
}

async function fetchKoreanMarketIntelligence(ticker: Ticker): Promise<MarketIntelligence | null> {
  // Naver provides the same ticker-level news, flow and research feed for Korean ETFs.
  // DART is still intentionally limited to listed operating companies below.
  if (ticker.assetType === "INDEX" || ticker.assetType === "ETN") return null;
  const url = `https://m.stock.naver.com/api/stock/${encodeURIComponent(ticker.code)}/integration`;
  // Keep the integration API internal to data collection. The displayed source
  // must lead users to a readable Naver Securities page, not raw JSON.
  const publicNewsUrl = `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(ticker.code)}/news`;
  const [response, recentNews] = await Promise.all([
    fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, cache: "no-store" }),
    fetchKoreanRecentNews(ticker).catch(() => []),
  ]);
  if (!response.ok) return recentNews.length ? { asOf: null, source: { title: "네이버 증권 종목 뉴스", url: `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(ticker.code)}/news` }, investor: null, consensus: null, researches: [], recentNews } : null;
  const payload = await response.json() as KoreanIntegrationResponse;
  const trends = payload.dealTrendInfos ?? [];
  const foreign = trends.map((row) => numberValue(row.foreignerPureBuyQuant));
  const institution = trends.map((row) => numberValue(row.organPureBuyQuant));
  const total = (values: Array<number | null>) => values.reduce<number | null>((sum, value) => value === null || sum === null ? null : sum + value, 0);
  const investor = trends.length ? {
    foreignToday: foreign[0] ?? null,
    institutionToday: institution[0] ?? null,
    foreignFiveDay: total(foreign),
    institutionFiveDay: total(institution),
    foreignBuyDays: foreign.filter((value) => (value ?? 0) > 0).length,
    institutionBuyDays: institution.filter((value) => (value ?? 0) > 0).length,
    foreignHoldingPct: numberValue(trends[0]?.foreignerHoldRatio),
  } : null;
  const consensus = payload.consensusInfo ? {
    rating: numberValue(payload.consensusInfo.recommMean),
    targetPrice: numberValue(payload.consensusInfo.priceTargetMean),
    asOf: payload.consensusInfo.createDate ?? null,
  } : null;
  const researches = (payload.researches ?? []).slice(0, 3).flatMap((row) => row.bnm && row.tit ? [{ broker: row.bnm, title: row.tit, date: row.wdt ?? null }] : []);
  if (!investor && !consensus && !researches.length && !recentNews.length) return null;
  return {
    asOf: trends[0]?.bizdate ?? consensus?.asOf ?? recentNews[0]?.publishedAt ?? null,
    source: { title: "네이버 증권 종목 뉴스", url: publicNewsUrl },
    investor,
    consensus,
    researches,
    recentNews,
  };
}

async function factPack(ticker: Ticker) {
  const dailyRows = await fetchTickerDailyChart(ticker, 7);
  const daily = withMovingAverages(aggregateCandles(dailyRows, "daily"));
  const weekly = withMovingAverages(aggregateCandles(dailyRows, "weekly"));
  const monthly = withMovingAverages(aggregateCandles(dailyRows, "monthly"));
  if (!daily.length) throw new Error("분석에 필요한 가격 이력이 없습니다.");
  const latest = daily.at(-1)!;
  const averageDailyVolume = daily.slice(-20).reduce((sum, row) => sum + row.volume, 0) / Math.max(1, Math.min(20, daily.length));
  const [classification, exchangeRate, fundamentals, marketIntelligence, dartDisclosures, convertibleOverhang] = await Promise.all([
    fetchSecurityClassification(ticker).catch(() => ({ sector: ticker.sector, industry: ticker.industry, themes: ticker.themes })),
    ticker.currency === "USD" ? fetchUsdKrwRate().catch(() => null) : Promise.resolve(null),
    fetchFundamentals(ticker),
    ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
      ? fetchKoreanMarketIntelligence(ticker).catch(() => null)
      : ticker.assetType !== "INDEX" ? fetchUsMarketIntelligence(ticker).catch(() => null) : Promise.resolve(null),
    ticker.market === "KOSPI" || ticker.market === "KOSDAQ" ? fetchDartDisclosures(ticker).catch(() => [] as DartDisclosure[]) : Promise.resolve([] as DartDisclosure[]),
    ticker.market === "KOSPI" || ticker.market === "KOSDAQ" ? fetchDartConvertibleOverhang(ticker, latest.close, averageDailyVolume).catch(() => null) : Promise.resolve(null),
  ]);
  const [secFilings, usPeers] = ticker.assetType === "STOCK" && !(ticker.market === "KOSPI" || ticker.market === "KOSDAQ")
    ? await Promise.all([
      fetchSecFilings(ticker).catch(() => [] as SecFiling[]),
      fetchUsPeerSnapshots(ticker, classification).catch(() => [] as UsPeerSnapshot[]),
    ])
    : [[], []] as const;
  const known = knownSources(ticker);
  const marketSource = known.find((source) => source.id === "M1")!;
  const fundamentalSource = fundamentals
    ? { id: "V1", title: fundamentals.source.title, url: fundamentals.source.url, publishedAt: fundamentals.asOf }
    : null;
  const intelligenceSource = marketIntelligence
    ? { id: "I1", title: marketIntelligence.source.title, url: marketIntelligence.source.url, publishedAt: marketIntelligence.asOf }
    : null;
  const evidence: AnalysisEvidenceCard[] = [
    {
      id: "E1", category: "price", claim: "최근 종가", value: String(latest.close), period: "일봉", asOf: latest.date,
      sourceId: marketSource.id, sourceTitle: marketSource.title, sourceUrl: marketSource.url, sourceTier: "market",
    },
    {
      id: "E2", category: "technical", claim: "주봉 MA10/MA240 위치", value: `종가 ${weekly.at(-1)?.close ?? "-"} · MA10 ${weekly.at(-1)?.ma10 ?? "-"} · MA240 ${weekly.at(-1)?.ma240 ?? "-"}`,
      period: "주봉", asOf: weekly.at(-1)?.date ?? null, sourceId: marketSource.id, sourceTitle: "LINE BREAKER 차트 계산", sourceUrl: marketSource.url, sourceTier: "derived",
    },
    {
      id: "E3", category: "technical", claim: "월봉 MA10/MA240 위치", value: `종가 ${monthly.at(-1)?.close ?? "-"} · MA10 ${monthly.at(-1)?.ma10 ?? "-"} · MA240 ${monthly.at(-1)?.ma240 ?? "-"}`,
      period: "월봉", asOf: monthly.at(-1)?.date ?? null, sourceId: marketSource.id, sourceTitle: "LINE BREAKER 차트 계산", sourceUrl: marketSource.url, sourceTier: "derived",
    },
    ...(fundamentals?.metrics.map((metric, index) => ({
      id: `F${index + 1}`, category: "fundamental" as const, claim: metric.label, value: `${metric.value} ${metric.unit}`,
      period: fundamentals.period, asOf: fundamentals.asOf, sourceId: fundamentalSource!.id, sourceTitle: fundamentalSource!.title,
      sourceUrl: fundamentalSource!.url, sourceTier: fundamentalSource!.title.startsWith("SEC ") ? "primary" as const : "market" as const,
    })) ?? []),
    ...dartDisclosures.slice(0, 5).map((disclosure, index) => ({
      id: `D${index + 1}`, category: "company" as const, claim: "최근 DART 공시", value: `${disclosure.reportName} · 제출인 ${disclosure.filerName}`,
      period: "최근 1년", asOf: disclosure.receiptDate || null, sourceId: `D${index + 1}`, sourceTitle: "금융감독원 전자공시시스템 DART",
      sourceUrl: disclosure.url, sourceTier: "primary" as const,
    })),
    ...(marketIntelligence?.recentNews.slice(0, 5).map((news, index) => ({
      id: `N${index + 1}`, category: "market" as const, claim: `최근 뉴스${news.directMention ? " · 종목 직접 언급" : " · 시장 맥락"}`, value: `${news.office} · ${news.title}`,
      period: "최근 뉴스", asOf: news.publishedAt, sourceId: `N${index + 1}`, sourceTitle: `네이버 증권 뉴스 · ${news.office}`,
      sourceUrl: news.url, sourceTier: "market" as const,
    })) ?? []),
    ...(convertibleOverhang && convertibleOverhang.instruments.length ? [{
      id: "C1", category: "company" as const, claim: "DART CB·BW 발행조건 기준 잠재 오버행",
      value: `잠재 신주 ${convertibleOverhang.totalPotentialShares.toLocaleString("ko-KR")}주 · 희석률 ${convertibleOverhang.dilutionPct === null ? "확인 불가" : `${convertibleOverhang.dilutionPct}%`} · 평균 거래량 ${convertibleOverhang.volumeDays === null ? "확인 불가" : `${convertibleOverhang.volumeDays}일치`}`,
      period: "최근 5년 발행결정", asOf: convertibleOverhang.asOf, sourceId: "C1", sourceTitle: convertibleOverhang.source.title, sourceUrl: convertibleOverhang.instruments[0].sourceUrl, sourceTier: "primary" as const,
    }] : []),
    ...secFilings.map((filing, index) => ({
      id: `S${index + 1}`, category: "company" as const, claim: `SEC ${filing.form} 제출`, value: `${filing.form}${filing.reportDate ? ` · 보고기간 ${filing.reportDate}` : ""}`,
      period: filing.form, asOf: filing.filingDate || null, sourceId: `S${index + 1}`, sourceTitle: "SEC EDGAR 원문", sourceUrl: filing.url, sourceTier: "primary" as const,
    })),
    ...usPeers.flatMap((peer, peerIndex) => peer.fundamentals.metrics.slice(0, 3).map((metric, metricIndex) => ({
      id: `P${peerIndex + 1}-${metricIndex + 1}`, category: "fundamental" as const, claim: `피어 ${peer.symbol} · ${metric.label}`, value: `${metric.value} ${metric.unit}`,
      period: peer.fundamentals.period, asOf: peer.fundamentals.asOf, sourceId: `P${peerIndex + 1}`, sourceTitle: `SEC EDGAR XBRL · ${peer.symbol}`,
      sourceUrl: peer.fundamentals.source.url, sourceTier: "primary" as const,
    }))),
  ];
  if (marketIntelligence?.investor && intelligenceSource) {
    evidence.push({
      id: "I2", category: "market", claim: "최근 5거래일 외국인·기관 순매수", value: `외국인 ${marketIntelligence.investor.foreignFiveDay ?? "미확인"}, 기관 ${marketIntelligence.investor.institutionFiveDay ?? "미확인"}`,
      period: "최근 5거래일", asOf: marketIntelligence.asOf, sourceId: intelligenceSource.id, sourceTitle: intelligenceSource.title, sourceUrl: intelligenceSource.url, sourceTier: "market",
    });
  }
  return {
    asOf: new Date().toISOString(),
    security: {
      code: ticker.code,
      name: ticker.name,
      market: ticker.market,
      assetType: ticker.assetType,
      currency: ticker.currency === "USD" ? "USD" : "KRW",
      marketCap: ticker.marketCap || null,
      sector: classification.sector ?? null,
      industry: classification.industry ?? null,
      themes: classification.themes ?? [],
      usdKrw: exchangeRate,
    },
    price: {
      current: latest.close,
      daily: pointSummary(daily),
      weekly: pointSummary(weekly),
      monthly: pointSummary(monthly),
      oneYear: rangeSummary(daily, 252),
      recentWeeklyCandles: weekly.slice(-26).map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume })),
      recentMonthlyCandles: monthly.slice(-24).map(({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume })),
    },
    fundamentals,
    marketIntelligence,
    convertibleOverhang,
    knownSources: [
      ...known,
      ...(fundamentalSource ? [fundamentalSource] : []),
      ...(intelligenceSource ? [intelligenceSource] : []),
      ...dartDisclosures.slice(0, 5).map((disclosure, index) => ({
        id: `D${index + 1}`, title: `DART · ${disclosure.reportName}`, url: disclosure.url, publishedAt: disclosure.receiptDate || null,
      })),
      ...(marketIntelligence?.recentNews.slice(0, 5).map((news, index) => ({
        id: `N${index + 1}`, title: `네이버 뉴스 · ${news.office} · ${news.title}`, url: news.url, publishedAt: news.publishedAt,
      })) ?? []),
      ...secFilings.map((filing, index) => ({
        id: `S${index + 1}`, title: `SEC EDGAR · ${filing.form}`, url: filing.url, publishedAt: filing.filingDate || null,
      })),
      ...usPeers.map((peer, index) => ({
        id: `P${index + 1}`, title: `SEC EDGAR XBRL · 피어 ${peer.symbol}`, url: peer.fundamentals.source.url, publishedAt: peer.fundamentals.asOf,
      })),
    ],
    evidence,
    dartDisclosures,
    secFilings,
    usPeers,
  };
}

function analysisInstructions(facts: Awaited<ReturnType<typeof factPack>>) {
  const evidence = facts.evidence.map((card) =>
    `[${card.id}] ${card.claim}: ${card.value} (${card.period ?? "기간 미확인"}, ${card.asOf ?? "기준일 미확인"}; ${card.sourceId})`,
  ).join("\n");
  return `검증 근거 카드:\n${evidence}\n\n반드시 먼저 다음 질문에 답한 뒤 보고서를 작성하라:\n- 사업 실체와 시장 테마가 분리되어 있는가? 확인되지 않은 테마 매출은 '검증 대기'로 표기한다.\n- 상승 논지에 가장 강한 반론은 무엇이며, 어떤 공시·실적·가격 조건에서 논지가 무효화되는가?\n- 수치가 근거 카드에 없으면 추정치로 만들지 말고 missingData에 기록한다.\n- 기술적 해석은 가격·거래량 패턴의 가능성으로만 표현하며, 세력·주포의 의도를 사실로 단정하지 않는다.\n- N으로 시작하는 최근 뉴스는 보도·시장 맥락이다. DART 공시나 회사 공식 자료가 없으면 계약·실적의 확정 사실로 격상하지 말고, catalyst_watch에서 확인할 조건으로만 사용한다.`;
}

const systemPrompt = `당신은 한국어로 작성하는 수석 주식 애널리스트다. 제공된 검증 근거 카드와 실제 확인한 웹 검색 근거만 사용한다.

반드시 지킬 원칙:
1. 사업부문별 매출 구성을 먼저 확인하고 시장 테마와 실제 매출 기여를 분리한다. 발표·개발·계약·매출반영 단계를 혼동하지 않는다.
2. 가격·실적·수급·목표가 등 모든 수치는 기준일과 근거를 확인한다. 찾지 못한 값은 만들지 말고 missingData에 기록한다.
3. 기술 분석에서 '세력'을 사실처럼 단정하지 않는다. 가격·거래량 구조에 따른 해석으로 표현한다.
4. 목표가·진입가·손절가는 산정 근거를 prices.method에 적고, 근거가 부족하면 null로 둔다.
5. 세 시나리오의 확률 합계는 100으로 작성한다. 확정적 상승 표현을 금지한다.
6. 제공된 근거 카드의 sourceId(M1, V1, I1 등) 또는 웹에서 실제 확인한 URL만 sources에 넣고 고유 id를 부여한다. 각 섹션 sourceIds가 이를 참조하게 한다. 근거가 없는 문단은 쓰지 않는다.
7. 다음 7개 id를 정확히 한 번씩, 지정 순서로 출력한다: ${STOCK_ANALYSIS_SECTION_ORDER.join(", ")}.
8. title은 지정된 한국어 제목을 사용한다: ${Object.entries(sectionTitles).map(([id, title]) => `${id}=${title}`).join(" | ")}.
9. ETF/ETN이면 기업 매출 분석 대신 상품 구조·추종지수·비용·괴리율·구성종목 중심으로 분석한다.
10. 각 섹션 summary는 180자·두 문장 이내, bullet은 110자 이내의 핵심 2~3개로 작성한다. 같은 숫자·근거를 섹션마다 반복하지 않는다.
11. 주봉·월봉 MA10과 MA240은 이 서비스의 최우선 기술 지표다. technical_analysis와 action_plan에서 현재 종가의 각 이평선 위·아래, 이격도, 직전 봉 대비 돌파·이탈 여부, 주봉과 월봉의 정합성을 반드시 먼저 판단한다. MA10·MA240 신호가 엇갈리면 추격 매수보다 관망·리스크 관리를 우선한다.
12. Fact Pack의 fundamentals가 있으면 그 안의 PER·PBR·EPS·BPS 등 수치를 fundamental_analysis에 반드시 해석하고, 숫자·기준기간·출처를 바꾸거나 추정하지 않는다.
13. Fact Pack의 marketIntelligence가 있으면 외국인·기관 최근 5거래일 순매수와 매수일 수, 외국인 보유비중, 컨센서스 목표가·의견을 기술·수급 해석에 반드시 반영한다.
14. missingData에는 직접 수집한 fundamentals 또는 marketIntelligence에 이미 있는 지표를 넣지 말고, 실제로 확인하지 못한 핵심 정보만 기록한다.
15. 마지막 disclaimer에는 '이 분석은 투자 조언이 아니며, 투자 판단은 본인의 책임입니다.'를 포함한다.
16. JSON만 출력하고, opinion 값은 반드시 STRONG_BUY, BUY, HOLD, SELL 중 하나를 정확히 사용한다. confidence는 % 기호 없는 0~100 숫자로 출력한다.
17. 결론을 확정적으로 표현하지 않는다. bullish 논지와 bearish 논지를 모두 catalyst_watch 또는 action_plan에 반영하고, 각각의 무효화 조건을 명시한다.
18. 미국 보통주에서 SEC 10-K·10-Q·8-K 및 피어 근거 카드가 제공되면, 사업부·가이던스·계약·위험요인은 해당 원문을 우선 인용하고 피어 수치는 동일 공시 기준기간인지 확인한 뒤 비교한다. 피어 카드가 없으면 비교 수치를 만들지 않는다.
19. 한국 종목에서 DART 근거 카드(D#)는 회사의 공식 공시이므로 사업·계약·실적·위험의 1차 근거로 우선 반영한다. 최근 뉴스(N#)는 제목·요약만으로 사실을 확정하지 말고, 직접 언급 여부와 공시 교차 확인 여부를 구분해 catalyst_watch와 business_reality에 반영한다.
20. 한국 종목에서 C1 카드가 제공되면 CB·BW의 발행조건 기준 잠재 오버행을 반드시 평가한다. 잠재 신주·희석률·평균 거래량 소화일수·현재가의 행사/전환가액 상회 여부를 언급하되, 카드가 '발행조건 기준'이면 실제 미상환 잔액으로 단정하지 말고 행사·상환 여부 확인 필요성을 명시한다.`;

function normalizeOpinion(value: unknown): RawAnalysis["opinion"] | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    return normalizeOpinion(candidate.value ?? candidate.label ?? candidate.rating ?? candidate.recommendation ?? candidate.opinion ?? candidate.text);
  }
  const normalized = typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]+/gu, "_")
    : "";
  const compact = normalized.replaceAll("_", "");
  if (normalized.includes("STRONG_BUY") || compact.includes("강력매수") || compact.includes("적극매수")) return "STRONG_BUY";
  if (normalized.includes("SELL") || compact.includes("매도") || normalized.includes("UNDERPERFORM")) return "SELL";
  if (normalized.includes("HOLD") || normalized.includes("NEUTRAL") || compact.includes("보유") || compact.includes("중립") || compact.includes("관망") || compact.includes("긍정도부정도아님")) return "HOLD";
  if (normalized.includes("BUY") || compact.includes("매수") || normalized.includes("OUTPERFORM") || normalized.includes("OVERWEIGHT") || normalized.includes("BULLISH") || compact.includes("긍정")) return "BUY";
  return null;
}

function findOpinion(value: Record<string, unknown>) {
  const direct = [value.opinion, value.investmentOpinion, value.investment_opinion, value.recommendation, value.rating, value["투자의견"]];
  for (const candidate of direct) {
    const opinion = normalizeOpinion(candidate);
    if (opinion) return opinion;
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (/(opinion|recommendation|rating|투자의견)/iu.test(key)) {
      const opinion = normalizeOpinion(candidate);
      if (opinion) return opinion;
    }
  }
  return null;
}

function normalizeConfidence(value: unknown): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.trim().replace(/[% ,]/gu, ""))
      : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const percentage = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  if (percentage < 0 || percentage > 100) return null;
  return Number(percentage.toFixed(1));
}

function parseRawAnalysis(content: string): RawAnalysis {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidates = [trimmed, fenced, firstBrace >= 0 && lastBrace > firstBrace ? trimmed.slice(firstBrace, lastBrace + 1) : null]
    .filter((candidate): candidate is string => Boolean(candidate));
  let value: unknown = null;
  for (const candidate of candidates) {
    try {
      value = JSON.parse(candidate);
      break;
    } catch {
      // Qwen may wrap a valid JSON object in a markdown fence or a short
      // explanation despite JSON mode; try the next safe extraction.
    }
  }
  if (!value) throw new Error("AI 분석 결과를 해석하지 못했습니다.");
  if (!value || typeof value !== "object") throw new Error("AI 분석 결과 형식이 올바르지 않습니다.");
  const root = value as Record<string, unknown>;
  const nested = Object.values(root).find((candidate) =>
    candidate !== null
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && (Array.isArray((candidate as Record<string, unknown>).sections) || findOpinion(candidate as Record<string, unknown>) !== null),
  );
  const raw = (nested ?? root) as RawAnalysis & Record<string, unknown>;
  const opinion = findOpinion(raw);
  if (!opinion) throw new Error("투자 의견 형식이 올바르지 않습니다.");
  raw.opinion = opinion;
  const confidence = normalizeConfidence(raw.confidence);
  if (confidence === null) throw new Error("분석 신뢰도 형식이 올바르지 않습니다.");
  raw.confidence = confidence;
  if (!Array.isArray(raw.sections) || raw.sections.length !== STOCK_ANALYSIS_SECTION_ORDER.length) throw new Error("7개 분석 섹션이 완성되지 않았습니다.");
  const byId = new Map(raw.sections.map((section) => [section.id, section]));
  raw.sections = STOCK_ANALYSIS_SECTION_ORDER.map((id) => {
    const section = byId.get(id);
    if (!section || !Array.isArray(section.bullets)) throw new Error("필수 분석 섹션이 누락됐습니다.");
    return { ...section, title: sectionTitles[id], sourceIds: Array.isArray(section.sourceIds) ? section.sourceIds : [] };
  });
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length !== 3) throw new Error("세 가지 투자 시나리오가 완성되지 않았습니다.");
  if (!Array.isArray(raw.sources) || !Array.isArray(raw.missingData)) throw new Error("출처 또는 누락 데이터 형식이 올바르지 않습니다.");
  return raw;
}

function citationUrls(response: OpenRouterResponse) {
  return new Set(
    (response.choices?.[0]?.message?.annotations ?? [])
      .map((annotation) => annotation.url_citation?.url)
      .filter((url): url is string => Boolean(url)),
  );
}

function parseResearchAgentBrief(content: string, role: ResearchAgentBrief["role"]): ResearchAgentBrief | null {
  try {
    const value = JSON.parse(content) as Partial<ResearchAgentBrief>;
    if (value.role !== role || !Array.isArray(value.findings) || !Array.isArray(value.openQuestions) || !Array.isArray(value.thesis) || !Array.isArray(value.counterThesis)) return null;
    const findings = value.findings.flatMap((finding) => {
      if (!finding || typeof finding.claim !== "string" || typeof finding.evidence !== "string") return [];
      const sourceUrls = Array.isArray(finding.sourceUrls) ? finding.sourceUrls.filter((url): url is string => typeof url === "string" && safeUrl(url)).slice(0, 3) : [];
      const importance = finding.importance === "high" || finding.importance === "medium" || finding.importance === "low" ? finding.importance : "medium";
      return [{ claim: finding.claim.slice(0, 280), evidence: finding.evidence.slice(0, 700), sourceUrls, importance }];
    }).slice(0, 8);
    return {
      role,
      findings,
      openQuestions: value.openQuestions.filter((item): item is string => typeof item === "string").slice(0, 6),
      thesis: value.thesis.filter((item): item is string => typeof item === "string").slice(0, 5),
      counterThesis: value.counterThesis.filter((item): item is string => typeof item === "string").slice(0, 5),
    };
  } catch {
    return null;
  }
}

function agentBriefForFinal(agent: ResearchAgentBrief | null, sourceIds: Map<string, string>) {
  if (!agent) return "해당 보조 에이전트의 결과는 수집되지 않았습니다. Fact Pack만으로 보수적으로 분석하십시오.";
  const findings = agent.findings.map((finding) => {
    const refs = finding.sourceUrls.map((url) => sourceIds.get(url)).filter(Boolean).join(", ");
    return `- [${finding.importance}] ${finding.claim}: ${finding.evidence}${refs ? ` (근거 ${refs})` : ""}`;
  }).join("\n");
  return `${agent.role === "research_scout" ? "리서치 수집가" : "반대 논지 검토자"} 메모:\n${findings}\n강세 논지: ${agent.thesis.join(" / ") || "미확인"}\n반대 논지: ${agent.counterThesis.join(" / ") || "미확인"}\n추가 확인: ${agent.openQuestions.join(" / ") || "없음"}`;
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || /aborted due to timeout|timeout/iu.test(error.message));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function assessAnalysisQuality(raw: RawAnalysis, sources: StockDeepAnalysis["sources"], evidence: AnalysisEvidenceCard[]): AnalysisQuality {
  const issues: string[] = [];
  const citedSections = raw.sections.filter((section) => section.sourceIds.length > 0).length;
  const citationCoveragePct = Math.round((citedSections / STOCK_ANALYSIS_SECTION_ORDER.length) * 100);
  if (citationCoveragePct < 85) issues.push("일부 분석 섹션에 확인 가능한 출처 연결이 부족합니다.");
  const scenarioTotal = raw.scenarios.reduce((sum, scenario) => sum + scenario.probabilityPct, 0);
  if (Math.abs(scenarioTotal - 100) > 1) issues.push(`시나리오 확률 합계가 ${scenarioTotal}%입니다.`);
  if (!raw.prices.method.trim()) issues.push("목표·진입·손절가의 산정 근거가 비어 있습니다.");
  if (sources.length < 2) issues.push("교차 확인된 출처 수가 충분하지 않습니다.");
  const primaryEvidenceCount = evidence.filter((card) => card.sourceTier === "primary").length;
  const score = Math.max(0, Math.min(100, 45 + Math.round(citationCoveragePct * 0.35) + Math.min(12, evidence.length) + Math.min(8, primaryEvidenceCount * 2) - issues.length * 12));
  return { score, citationCoveragePct, evidenceCount: evidence.length, primaryEvidenceCount, issues };
}

async function requestAnalysis(ticker: Ticker, model: string): Promise<StockDeepAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI 분석 서비스가 아직 설정되지 않았습니다.");
  const facts = await factPack(ticker);
  const isGlm53 = /^z-ai\/glm-5\.3(?::[^\s]+)?$/iu.test(model);
  const isGlm53Flash = /^z-ai\/glm-5\.3-flash(?::[^\s]+)?$/iu.test(model);
  const isGlm53Family = isGlm53 || isGlm53Flash;
  const isQwen38Max = /^qwen\/qwen3\.8-max(?::[^\s]+)?$/iu.test(model);
  const isQwen38Flash = /^qwen\/qwen3\.8-flash(?::[^\s]+)?$/iu.test(model);
  const researchTimeoutMs = isQwen38Max || isQwen38Flash ? 12_000 : 26_000;
  // Qwen Max needs more time for low-effort reasoning plus strict JSON. Its
  // own response is materially more valuable than two web-plugin calls that
  // currently time out, so reserve the request budget for the final editor.
  const responseTimeoutMs = isGlm53Family ? 35_000 : isQwen38Max ? 140_000 : 85_000;
  const post = (requestBody: object, timeoutMs = responseTimeoutMs) => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": process.env.AUTH_BASE_URL || "http://localhost:3000",
      "x-title": "LINE BREAKER Stock Deep Analysis",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Qwen's capacity limit is commonly surfaced as an immediate 429. Retrying
  // the same model after a short, bounded pause is more reliable than sending
  // an already-grounded report to a different model mid-analysis.
  const postWithQwenRateLimitRetry = async (requestBody: object, timeoutMs: number, role: string) => {
    let response = await post(requestBody, timeoutMs);
    for (let attempt = 1; response.status === 429 && attempt <= 2; attempt += 1) {
      const delayMs = attempt * 1_500;
      console.warn(JSON.stringify({ service: "line-breaker-analysis", event: "qwen_rate_limit_retry", role, model: (requestBody as { model?: string }).model, attempt, delayMs }));
      await wait(delayMs);
      response = await post(requestBody, timeoutMs);
    }
    return response;
  };
  const researchAgent = async (role: ResearchAgentBrief["role"]) => {
    const isScout = role === "research_scout";
    const instruction = isScout
      ? "당신은 주식 리서치 수집가다. 제공된 Fact Pack을 기준으로 회사 IR·DART/SEC 공시·공식 정책·거래소 자료를 우선 검색해, 사업 실체·수주·계약·업종 KPI를 수집한다. 블로그·커뮤니티는 결론 근거로 쓰지 않는다."
      : "당신은 독립적인 반대 논지 검토자다. 제공된 Fact Pack과 공식 자료를 검색해 밸류에이션·회계기준·수주잔고의 질·테마 과장·매크로 리스크를 공격적으로 검증한다. 추측이나 세력 의도를 사실로 쓰지 않는다.";
    try {
      const response = await postWithQwenRateLimitRetry({
        model,
        temperature: 0.1,
        max_tokens: 1_800,
        messages: [
          { role: "system", content: `${instruction}\n모든 finding에는 실제로 확인한 URL만 sourceUrls에 넣어라. JSON만 출력한다.` },
          { role: "user", content: `종목 리서치 Fact Pack:\n${JSON.stringify(facts)}\n\n${analysisInstructions(facts)}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: role, strict: true, schema: researchAgentSchema } },
        plugins: [{ id: "web", max_results: 7 }],
        provider: { require_parameters: true, allow_fallbacks: true },
      }, researchTimeoutMs, role);
      if (!response.ok) return { brief: null, urls: new Set<string>() };
      const payload = await response.json() as OpenRouterResponse;
      const brief = parseResearchAgentBrief(payload.choices?.[0]?.message?.content ?? "", role);
      const allowedUrls = citationUrls(payload);
      if (!brief) return { brief: null, urls: new Set<string>() };
      brief.findings = brief.findings.map((finding) => ({ ...finding, sourceUrls: finding.sourceUrls.filter((url) => allowedUrls.has(url)) }));
      return { brief, urls: allowedUrls };
    } catch (error) {
      console.warn(JSON.stringify({ service: "line-breaker-analysis", event: `${role}.unavailable`, details: error instanceof Error ? error.message : "unknown" }));
      return { brief: null, urls: new Set<string>() };
    }
  };
  // Qwen Max currently times out on OpenRouter's web plugin. The server-side
  // Fact Pack still contains price history, filings, fundamentals, peers and
  // market intelligence; reserve the time budget for its stronger final pass.
  const noResearchResult: { brief: ResearchAgentBrief | null; urls: Set<string> } = { brief: null, urls: new Set<string>() };
  const scoutResult = isQwen38Max ? noResearchResult : await researchAgent("research_scout");
  const riskResult = isQwen38Max ? noResearchResult : await researchAgent("risk_reviewer");
  const agentUrls = [...new Set([...scoutResult.urls, ...riskResult.urls])];
  const baseSources = facts.knownSources;
  const agentSources = agentUrls.map((url, index) => ({ id: `R${index + 1}`, title: "리서치 에이전트가 확인한 공개 자료", url, publishedAt: null }));
  const researchSources = [...baseSources, ...agentSources];
  const researchSourceIds = new Map(researchSources.map((source) => [source.url, source.id]));
  const baseBody = {
    model,
    temperature: 0.2,
    // GLM 5.3 includes its unavoidable reasoning in the completion budget.
    // Leave room for both low-effort reasoning and the seven-section JSON.
    max_tokens: isGlm53Family ? 8_000 : isQwen38Max ? 6_500 : 9_000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `다음 종목을 오늘 기준으로 심층 분석하라. 원시 Fact Pack:\n${JSON.stringify(facts)}\n\n${analysisInstructions(facts)}\n\n${agentBriefForFinal(scoutResult.brief, researchSourceIds)}\n\n${agentBriefForFinal(riskResult.brief, researchSourceIds)}` },
    ],
  };
  const strictSchemaBody = {
    ...baseBody,
    reasoning: { effort: "none", exclude: true },
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "stock_deep_analysis", strict: true, schema: analysisSchema },
    },
  };
  // Flash supports JSON mode without schema enforcement. Full GLM 5.3 uses
  // the strict schema body below with its supported low reasoning effort.
  const jsonObjectBody = {
    ...baseBody,
    response_format: { type: "json_object" as const },
  };
  const glm53SchemaBody = {
    ...baseBody,
    reasoning: { effort: "low", exclude: true },
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "stock_deep_analysis", strict: true, schema: analysisSchema },
    },
  };
  const flashFallbackBody = {
    ...glm53SchemaBody,
    model: "qwen/qwen3.8-max",
    max_tokens: 6_500,
    provider: { allow_fallbacks: true },
  };
  let response: Response;
  try {
    response = await postWithQwenRateLimitRetry(isGlm53 || isQwen38Max
      ? { ...glm53SchemaBody, provider: { allow_fallbacks: true } }
      : isGlm53Flash
        ? { ...jsonObjectBody, provider: { allow_fallbacks: true } }
        // Research agents already ran independent web searches. The final
        // editor receives their verified findings and the server Fact Pack;
        // avoiding a third simultaneous web-provider job prevents 429 bursts.
        : { ...strictSchemaBody, provider: { require_parameters: true, allow_fallbacks: true } }, responseTimeoutMs, "final_editor");
  } catch (error) {
    if ((!isGlm53Family && !isQwen38Flash) || !isTimeoutError(error)) throw error;
    const configuredFallback = process.env.OPENROUTER_ANALYSIS_FALLBACK_MODEL?.trim() || DEFAULT_ANALYSIS_MODEL;
    const fallbackModel = isQwen38Flash ? "qwen/qwen3.8-max" : configuredFallback !== model ? configuredFallback : "openrouter/auto";
    console.warn(JSON.stringify({ service: "line-breaker-analysis", event: "model_timeout_fallback", selectedModel: model, fallbackModel }));
    response = await postWithQwenRateLimitRetry(isQwen38Flash ? flashFallbackBody : {
      ...strictSchemaBody,
      model: fallbackModel,
      provider: { require_parameters: true, allow_fallbacks: true },
    }, isQwen38Flash ? 140_000 : 70_000, "timeout_fallback");
    if (!response.ok) {
      const fallbackPayload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error(JSON.stringify({ service: "line-breaker-analysis", event: "model_timeout_fallback_failed", selectedModel: model, fallbackModel, details: fallbackPayload?.error?.message || `HTTP ${response.status}` }));
      throw new Error("선택한 모델과 자동 대체 모델이 모두 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
  if (!response.ok) {
    const initialPayload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const initialMessage = initialPayload?.error?.message || `HTTP ${response.status}`;
    const initialStatus = response.status;
    if (initialStatus === 429) {
      if (!isQwen38Flash) throw new Error("선택한 Qwen 모델이 현재 혼잡합니다. 잠시 후 다시 시도해 주세요.");
      console.warn(JSON.stringify({ service: "line-breaker-analysis", event: "flash_rate_limit_fallback", selectedModel: model, fallbackModel: "qwen/qwen3.8-max" }));
      response = await postWithQwenRateLimitRetry(flashFallbackBody, 140_000, "flash_rate_limit_fallback");
      if (!response.ok) throw new Error("선택한 Qwen 모델과 Max 대체 모델이 모두 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.");
    }
    const capabilityFailure = response.status === 400 && /(json.?schema|response_format|reasoning|plugin|unsupported parameter)/iu.test(initialMessage);
    if (capabilityFailure) {
      // Providers vary in which OpenRouter extensions they implement. The
      // fact pack is collected server-side, so a validated JSON-only retry
      // still yields a grounded analysis instead of rejecting the model.
      response = await postWithQwenRateLimitRetry({ ...jsonObjectBody, provider: { allow_fallbacks: true } }, responseTimeoutMs, "compatibility_retry");
    }
    if (response.ok) {
      // Continue to parse the successful compatibility retry below.
    } else {
    const providerFailure = response.status >= 500 || /provider.+error/iu.test(initialMessage);
    if (!providerFailure) {
      throw new Error(`AI 분석 요청 실패: ${initialMessage}`);
    }
    // A provider can reject a healthy model transiently (capacity, upstream
    // rate limit, or its web-search worker). Retrying the exact same model has
    // little value; use another configured Qwen model with the already
    // collected Fact Pack and no web plugin. This keeps a single provider
    // hiccup from making the whole analysis unavailable.
    const configuredFallback = process.env.OPENROUTER_ANALYSIS_FALLBACK_MODEL?.trim().toLowerCase() || DEFAULT_ANALYSIS_MODEL;
    const fallbackModel = [configuredFallback, ...analysisModelSuggestions(), "openrouter/auto"]
      .find((candidate) => candidate !== model) || "openrouter/auto";
    console.warn(JSON.stringify({
      service: "line-breaker-analysis",
      event: "provider_error_fallback",
      selectedModel: model,
      fallbackModel,
      initialStatus,
      initialMessage,
    }));
    response = await postWithQwenRateLimitRetry({
      ...jsonObjectBody,
      model: fallbackModel,
      provider: { allow_fallbacks: true },
    }, 70_000, "provider_fallback");
    if (!response.ok) {
      const retryPayload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      const retryMessage = retryPayload?.error?.message || `HTTP ${response.status}`;
      console.error(JSON.stringify({
        service: "line-breaker-analysis",
        event: "provider_retry_failed",
        selectedModel: model,
        fallbackModel,
        initialStatus,
        initialMessage,
        retryStatus: response.status,
        retryMessage,
      }));
      throw new Error("AI 분석 제공자의 일시적 오류로 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    }
  }
  let payload = await response.json() as OpenRouterResponse;
  let content = payload.choices?.[0]?.message?.content;
  if (payload.choices?.[0]?.finish_reason === "length") {
    // The first request already completed research. The recovery path must not
    // start another web-search / strict-schema job: those are the two most
    // failure-prone provider extensions and were causing the 압축 재시도 to
    // fail even after a valid model response. Reuse the server-collected, cited Fact Pack
    // and ask the same model for a plain JSON, compact editor pass. The normal cap is summary 180자 이내;
    // recovery is deliberately tighter to guarantee a complete response.
    const compactResponse = await postWithQwenRateLimitRetry({
      ...jsonObjectBody,
      max_tokens: 6_000,
      messages: [
        ...baseBody.messages,
        { role: "user", content: "이전 초안은 너무 길었습니다. 위 Fact Pack과 리서치 브리프만 근거로 JSON 전체를 다시 작성하십시오. 각 섹션 summary는 140자 이내, bullet은 정확히 2개·각 80자 이내, sourceIds는 최대 3개, sources는 최대 10개로 제한합니다. 웹 검색·추가 조사·추론 설명은 하지 말고, 바로 완결된 JSON만 출력하십시오." },
      ],
      provider: { allow_fallbacks: true },
    }, 75_000, "compact_retry");
    if (!compactResponse.ok) {
      const compactFailure = await compactResponse.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error(JSON.stringify({
        service: "line-breaker-analysis",
        event: "compact_retry_failed",
        selectedModel: model,
        status: compactResponse.status,
        details: compactFailure?.error?.message || `HTTP ${compactResponse.status}`,
      }));
      throw new Error("AI 분석의 압축 재시도에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    payload = await compactResponse.json() as OpenRouterResponse;
    content = payload.choices?.[0]?.message?.content;
    if (payload.choices?.[0]?.finish_reason === "length") throw new Error("AI 분석 출력 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!content) throw new Error("AI 분석 결과가 비어 있습니다.");
  let raw: RawAnalysis;
  try {
    raw = parseRawAnalysis(content);
  } catch (parseError) {
    // Qwen can occasionally finish a useful draft while omitting a required
    // JSON field or one section. Give that same model one short editor pass
    // before discarding the entire analysis; no new web work is started here.
    console.warn(JSON.stringify({
      service: "line-breaker-analysis",
      event: "incomplete_response_repair",
      selectedModel: model,
      details: parseError instanceof Error ? parseError.message : "unknown",
    }));
    const repairResponse = await postWithQwenRateLimitRetry({
      model,
      temperature: 0,
      max_tokens: 4_800,
      messages: [
        { role: "system", content: `${systemPrompt}\n이전 초안의 형식 오류만 고친다. 새 웹 검색·새 수치 추정 없이, 제공된 Fact Pack과 초안에 있는 검증 가능한 내용만 사용한다.` },
        { role: "user", content: `Fact Pack:\n${JSON.stringify(facts)}\n\n형식 오류가 있는 이전 초안:\n${content.slice(0, 24_000)}\n\n반드시 7개 섹션, 3개 시나리오, opinion·confidence·prices·sources·missingData·disclaimer를 모두 포함한 완결된 JSON만 다시 출력하십시오. 각 섹션은 짧게 작성하고, 확인할 수 없는 내용은 missingData로 옮기십시오.` },
      ],
      response_format: { type: "json_object" as const },
      provider: { allow_fallbacks: true },
    }, 28_000, "incomplete_response_repair");
    if (!repairResponse.ok) {
      const repairFailure = await repairResponse.json().catch(() => null) as { error?: { message?: string } } | null;
      console.error(JSON.stringify({
        service: "line-breaker-analysis",
        event: "incomplete_response_repair_failed",
        selectedModel: model,
        status: repairResponse.status,
        details: repairFailure?.error?.message || `HTTP ${repairResponse.status}`,
      }));
      throw parseError;
    }
    const repairedPayload = await repairResponse.json() as OpenRouterResponse;
    const repairedContent = repairedPayload.choices?.[0]?.message?.content;
    if (!repairedContent) throw parseError;
    raw = parseRawAnalysis(repairedContent);
    payload = repairedPayload;
  }
  const allowedUrls = citationUrls(payload);
  for (const source of researchSources) allowedUrls.add(source.url);
  const verifiedSources = raw.sources.filter((source) => safeUrl(source.url) && allowedUrls.has(source.url));
  const sourceMap = new Map([...researchSources, ...verifiedSources].map((source) => [source.id, source]));
  const sources = [...sourceMap.values()];
  const validSourceIds = new Set(sources.map((source) => source.id));
  const sections = raw.sections.map((section) => ({
    ...section,
    sourceIds: section.sourceIds.filter((sourceId) => validSourceIds.has(sourceId)),
  }));
  const quality = assessAnalysisQuality({ ...raw, sections }, sources, facts.evidence);
  return {
    ...raw,
    sections,
    sources,
    disclaimer: "이 분석은 공개정보를 바탕으로 AI가 작성한 참고 자료입니다. 이 분석은 투자 조언이 아니며, 투자 판단은 본인의 책임입니다.",
    security: {
      code: ticker.code,
      name: ticker.name,
      market: ticker.market,
      currency: ticker.currency === "USD" ? "USD" : "KRW",
      marketCap: ticker.marketCap || null,
    },
    fundamentals: facts.fundamentals,
    marketIntelligence: facts.marketIntelligence,
    convertibleOverhang: facts.convertibleOverhang,
    evidence: facts.evidence,
    quality,
    generatedAt: new Date().toISOString(),
    model: payload.model || model,
    cached: false,
  };
}

export async function analyzeStock(code: string, market: Market): Promise<StockDeepAnalysis> {
  const model = await getConfiguredAnalysisModel();
  const key = `v8:${model}:${market}:${code.trim().toUpperCase()}`;
  const cached = analysisCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.analysis, cached: true };
  const pending = analysisRequests.get(key);
  if (pending) return pending;
  const request = resolveTicker(code, market)
    .then((ticker) => requestAnalysis(ticker, model))
    .then((analysis) => {
      analysisCache.set(key, { expiresAt: Date.now() + ANALYSIS_CACHE_MS, analysis });
      return analysis;
    })
    .finally(() => analysisRequests.delete(key));
  analysisRequests.set(key, request);
  return request;
}
