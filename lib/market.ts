import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { marketSearchIndex } from "@/db/schema";

export type Region = "kr" | "us";
export type Market = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE" | "AMEX" | "US_ETF" | "GLOBAL";
export type MarketFilter = "all" | "kospi" | "kosdaq" | "nasdaq" | "nyse" | "amex";
export type AssetType = "STOCK" | "ETF" | "ETN" | "INDEX";
export type AssetFilter = "all" | "stock" | "etp";
export type Timeframe = "weekly" | "monthly";
export type ChartTimeframe = "daily" | Timeframe;
export type ScreeningTimeframe = Timeframe | "both";
export type MovingAveragePeriod = 10 | 240;
export type ScreeningMaPeriod = MovingAveragePeriod | "both";
export type MarketRankMetric = "tradingValue" | "changePct" | "volume" | "marketCap";

export type Ticker = {
  code: string;
  name: string;
  market: Market;
  assetType: AssetType;
  marketCap: number;
  price: number;
  currency?: "KRW" | "USD";
  /** USD denominated instruments only. Applied server-side at scan/chart time. */
  krwPrice?: number;
  exchangeRate?: number;
  /** Latest session change supplied by the market-universe provider. */
  changePct?: number;
  /** Latest session accumulated volume where the provider supplies it. */
  tradingVolume?: number;
  /** Latest session accumulated traded value in the instrument currency. */
  tradingValue?: number;
  tradedAt?: string;
  isNasdaq100?: boolean;
  /** Ranking classification enrichment state. */
  classificationStatus?: "pending" | "ready" | "unavailable";
  sector?: string;
  industry?: string;
  themes?: string[];
};

export type DailyRow = {
  localDate: string;
  openPrice: number | string;
  highPrice: number | string;
  lowPrice: number | string;
  closePrice: number | string;
  accumulatedTradingVolume?: number | string;
};

export type PeriodCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartPoint = PeriodCandle & {
  ma5: number | null;
  ma10: number | null;
  ma240: number | null;
};

export type Candidate = Ticker & {
  timeframe: Timeframe;
  maPeriod: MovingAveragePeriod;
  matchedTimeframes?: Timeframe[];
  matchedMaPeriods?: MovingAveragePeriod[];
  date: string;
  previousClose: number;
  previousMa: number;
  close: number;
  ma: number;
  gapPct: number;
  previousVolume: number;
  volume: number;
  volumeChangePct: number | null;
  volumeStatus: "증가" | "감소" | "동일" | "비교 불가";
  status: "근접 돌파" | "상승 진행" | "추격 주의";
};

export type TradingQuote = {
  ticker: Ticker;
  nativePrice: string;
  nativeCurrency: "KRW" | "USD";
  quoteSource: string;
  quoteAt: Date;
  quoteReceivedAt: Date;
  fxRate: string;
  fxSource: string;
  fxAt: Date;
  fxReceivedAt: Date;
};

export class MarketQuoteError extends Error {
  constructor(
    public readonly code: "UNSUPPORTED_SECURITY" | "QUOTE_UNAVAILABLE" | "STALE_QUOTE" | "STALE_FX",
    message: string,
  ) {
    super(message);
    this.name = "MarketQuoteError";
  }
}

const NAVER_HEADERS = {
  accept: "application/json",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
};

const US_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": NAVER_HEADERS["user-agent"],
};

function numeric(value: unknown): number {
  const parsed = Number(String(value ?? "0").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumeric(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === "" || String(value).toUpperCase() === "N/A") return undefined;
  const parsed = Number(String(value).replaceAll(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: NAVER_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Market data request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function fetchUsJson<T>(url: string): Promise<T> {
  const urls = url.includes("query1.finance.yahoo.com")
    ? [url, url.replace("query1.finance.yahoo.com", "query2.finance.yahoo.com")]
    : [url];
  let lastStatus = 0;
  for (const endpoint of urls) {
    const response = await fetch(endpoint, { headers: US_HEADERS, cache: "no-store" });
    if (response.ok) return (await response.json()) as T;
    lastStatus = response.status;
  }
  throw new Error(`US market data request failed (${lastStatus})`);
}

async function fetchMarket(slug: Market, assetFilter: AssetFilter): Promise<Ticker[]> {
  const pageSize = 100;
  const endpoint = (page: number) =>
    `https://m.stock.naver.com/api/stocks/marketValue/${slug}?page=${page}&pageSize=${pageSize}`;
  const first = await fetchJson<{
    totalCount?: number;
    stocks?: Record<string, unknown>[];
  }>(endpoint(1));
  const totalPages = Math.max(1, Math.ceil((first.totalCount ?? 0) / pageSize));
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
      fetchJson<{ stocks?: Record<string, unknown>[] }>(endpoint(index + 2)),
    ),
  );
  const rows = [first, ...remaining].flatMap((page) => page.stocks ?? []);
  const seen = new Set<string>();
  const tickers: Ticker[] = [];

  for (const row of rows) {
    const sourceType = String(row.stockEndType ?? "").toLowerCase();
    const assetType: AssetType = sourceType === "etf" ? "ETF" : sourceType === "etn" ? "ETN" : "STOCK";
    if (assetFilter === "stock" && assetType !== "STOCK") continue;
    if (assetFilter === "etp" && assetType === "STOCK") continue;
    const code = String(row.itemCode ?? "").trim().toUpperCase();
    const name = String(row.stockName ?? "").trim();
    if (!code || !name || seen.has(code)) continue;
    seen.add(code);
    tickers.push({
      code,
      name,
      market: slug,
      assetType,
      marketCap: numeric(row.marketValueRaw),
      price: numeric(row.closePrice),
      changePct: optionalNumeric(row.fluctuationsRatio),
      tradingVolume: optionalNumeric(row.accumulatedTradingVolumeRaw ?? row.accumulatedTradingVolume),
      tradingValue: optionalNumeric(row.accumulatedTradingValueRaw ?? row.accumulatedTradingValue),
      tradedAt: typeof row.localTradedAt === "string" ? row.localTradedAt : undefined,
    });
  }
  return tickers;
}

export async function fetchUniverse(filter: MarketFilter, assetFilter: AssetFilter = "all"): Promise<Ticker[]> {
  const markets: Market[] =
    filter === "all" ? ["KOSPI", "KOSDAQ"] : [filter.toUpperCase() as Market];
  const groups = await Promise.all(markets.map((market) => fetchMarket(market, assetFilter)));
  return groups.flat().sort((a, b) => b.marketCap - a.marketCap || a.code.localeCompare(b.code));
}

type NasdaqRow = {
  symbol?: string;
  name?: string;
  lastsale?: string;
  marketCap?: string;
  pctchange?: string;
};

// This is deliberately curated instead of scanning every listed ETF.  The screener
// is most useful where the underlying product has durable liquidity and broad
// investor recognition; thin, short-lived and single-stock products add noise.
// Leveraged and inverse ETFs are included when they are widely traded. ETNs are
// intentionally excluded because the current Nasdaq data path does not provide a
// dependable ETN universe and historical-data contract.
const US_MAJOR_ETFS: ReadonlyArray<Pick<Ticker, "code" | "name">> = [
  ["SPY", "SPDR S&P 500 ETF Trust"], ["VOO", "Vanguard S&P 500 ETF"], ["IVV", "iShares Core S&P 500 ETF"], ["SPLG", "SPDR Portfolio S&P 500 ETF"], ["VTI", "Vanguard Total Stock Market ETF"], ["ITOT", "iShares Core S&P Total U.S. Stock Market ETF"],
  ["QQQ", "Invesco QQQ Trust"], ["QQQM", "Invesco NASDAQ 100 ETF"], ["DIA", "SPDR Dow Jones Industrial Average ETF Trust"], ["IWM", "iShares Russell 2000 ETF"], ["IJR", "iShares Core S&P Small-Cap ETF"], ["MDY", "SPDR S&P MidCap 400 ETF Trust"],
  ["SCHD", "Schwab U.S. Dividend Equity ETF"], ["VYM", "Vanguard High Dividend Yield ETF"], ["DGRO", "iShares Core Dividend Growth ETF"], ["HDV", "iShares Core High Dividend ETF"], ["JEPI", "JPMorgan Equity Premium Income ETF"], ["JEPQ", "JPMorgan Nasdaq Equity Premium Income ETF"], ["DIVO", "Amplify CWP Enhanced Dividend Income ETF"], ["XYLD", "Global X S&P 500 Covered Call ETF"], ["QYLD", "Global X Nasdaq 100 Covered Call ETF"],
  ["XLK", "Technology Select Sector SPDR Fund"], ["XLF", "Financial Select Sector SPDR Fund"], ["XLE", "Energy Select Sector SPDR Fund"], ["XLV", "Health Care Select Sector SPDR Fund"], ["XLY", "Consumer Discretionary Select Sector SPDR Fund"], ["XLI", "Industrial Select Sector SPDR Fund"], ["XLP", "Consumer Staples Select Sector SPDR Fund"], ["XLU", "Utilities Select Sector SPDR Fund"], ["XLB", "Materials Select Sector SPDR Fund"], ["XLRE", "Real Estate Select Sector SPDR Fund"], ["XLC", "Communication Services Select Sector SPDR Fund"],
  ["SMH", "VanEck Semiconductor ETF"], ["SOXX", "iShares Semiconductor ETF"], ["SOXL", "Direxion Daily Semiconductor Bull 3X Shares"], ["SOXS", "Direxion Daily Semiconductor Bear 3X Shares"], ["BOTZ", "Global X Robotics & Artificial Intelligence ETF"], ["ARKK", "ARK Innovation ETF"], ["AIQ", "Global X Artificial Intelligence & Technology ETF"], ["CIBR", "First Trust Nasdaq Cybersecurity ETF"], ["HACK", "Amplify Cybersecurity ETF"], ["ITA", "iShares U.S. Aerospace & Defense ETF"], ["XAR", "SPDR S&P Aerospace & Defense ETF"],
  ["TLT", "iShares 20+ Year Treasury Bond ETF"], ["IEF", "iShares 7-10 Year Treasury Bond ETF"], ["SHY", "iShares 1-3 Year Treasury Bond ETF"], ["BND", "Vanguard Total Bond Market ETF"], ["AGG", "iShares Core U.S. Aggregate Bond ETF"], ["LQD", "iShares iBoxx $ Investment Grade Corporate Bond ETF"], ["HYG", "iShares iBoxx $ High Yield Corporate Bond ETF"], ["TIP", "iShares TIPS Bond ETF"], ["SGOV", "iShares 0-3 Month Treasury Bond ETF"], ["BIL", "SPDR Bloomberg 1-3 Month T-Bill ETF"],
  ["GLD", "SPDR Gold Shares"], ["IAU", "iShares Gold Trust"], ["SLV", "iShares Silver Trust"], ["USO", "United States Oil Fund"], ["UNG", "United States Natural Gas Fund"], ["DBC", "Invesco DB Commodity Index Tracking Fund"],
  ["EFA", "iShares MSCI EAFE ETF"], ["VEA", "Vanguard FTSE Developed Markets ETF"], ["VWO", "Vanguard FTSE Emerging Markets ETF"], ["EEM", "iShares MSCI Emerging Markets ETF"], ["EWY", "iShares MSCI South Korea ETF"], ["KWEB", "KraneShares CSI China Internet ETF"], ["FXI", "iShares China Large-Cap ETF"], ["INDA", "iShares MSCI India ETF"],
  ["TQQQ", "ProShares UltraPro QQQ"], ["SQQQ", "ProShares UltraPro Short QQQ"], ["QLD", "ProShares Ultra QQQ"], ["QID", "ProShares UltraShort QQQ"], ["UPRO", "ProShares UltraPro S&P500"], ["SPXU", "ProShares UltraPro Short S&P500"], ["SSO", "ProShares Ultra S&P500"], ["SDS", "ProShares UltraShort S&P500"], ["TECL", "Direxion Daily Technology Bull 3X Shares"], ["TECS", "Direxion Daily Technology Bear 3X Shares"], ["FAS", "Direxion Daily Financial Bull 3X Shares"], ["FAZ", "Direxion Daily Financial Bear 3X Shares"],
  ["IBIT", "iShares Bitcoin Trust ETF"], ["FBTC", "Fidelity Wise Origin Bitcoin Fund"], ["ETHA", "iShares Ethereum Trust ETF"], ["BITB", "Bitwise Bitcoin ETF"],
].map(([code, name]) => ({ code, name }));

async function fetchUsMajorEtfs(): Promise<Ticker[]> {
  return US_MAJOR_ETFS.map((definition) => ({
      code: definition.code,
      name: definition.name,
      // The curated universe spans Nasdaq, NYSE Arca and Cboe listings. Keep this
      // as a product-market label rather than incorrectly presenting one venue.
      market: "US_ETF" as const,
      assetType: "ETF" as const,
      marketCap: 0,
      // The screening and chart paths obtain the latest close from the historical
      // endpoint. A list quote is intentionally not trusted as scan input.
      price: 0,
      currency: "USD" as const,
    }));
}

function usdNumber(value: unknown): number {
  return numeric(String(value ?? "").replace(/[$]/g, ""));
}

function isUsCommonStock(row: NasdaqRow) {
  const name = String(row.name ?? "").toLowerCase();
  // Nasdaq's screener includes funds and non-common security classes in every exchange.
  return !/(etf|fund|trust|note|warrant|rights|units|unit |preferred|depositary|adr)/.test(name);
}

async function fetchUsExchange(exchange: "nasdaq" | "nyse" | "amex", limit = 1000): Promise<Ticker[]> {
  const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=${limit}&offset=0&exchange=${exchange}`;
  const payload = await fetchUsJson<{ data?: { table?: { rows?: NasdaqRow[] } } }>(url);
  const market = exchange.toUpperCase() as Extract<Market, "NASDAQ" | "NYSE" | "AMEX">;
  const rows = payload.data?.table?.rows ?? [];
  return rows
    .filter((row) => row.symbol && row.name && isUsCommonStock(row))
    .map((row) => ({
      code: String(row.symbol).toUpperCase(),
      name: String(row.name).replace(/\s+(Common Stock|Class [A-Z] Common Stock)$/i, "").trim(),
      market,
      assetType: "STOCK" as const,
      marketCap: usdNumber(row.marketCap),
      price: usdNumber(row.lastsale),
      currency: "USD" as const,
      changePct: optionalNumeric(row.pctchange),
    }))
    .filter((ticker) => ticker.code && ticker.price > 0);
}

/**
 * The first rollout scans the liquid, largest 1,000 names per exchange.
 * This keeps a browser-triggered scan responsive while the provider layer remains
 * compatible with a future scheduled full-market batch.
 */
export async function fetchUsUniverse(filter: MarketFilter, assetFilter: AssetFilter = "stock"): Promise<Ticker[]> {
  if (assetFilter === "etp") return fetchUsMajorEtfs();
  if (assetFilter === "all") {
    const [stocks, etfs] = await Promise.all([fetchUsUniverse(filter, "stock"), fetchUsMajorEtfs()]);
    return [...stocks, ...etfs];
  }
  const exchanges: Array<"nasdaq" | "nyse" | "amex"> =
    filter === "all" ? ["nasdaq", "nyse", "amex"] : [filter as "nasdaq" | "nyse" | "amex"];
  const groups = await Promise.all(exchanges.map((exchange) => fetchUsExchange(exchange)));
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((ticker) => {
      if (seen.has(ticker.code)) return false;
      seen.add(ticker.code);
      return true;
    })
    .sort((a, b) => b.marketCap - a.marketCap || a.code.localeCompare(b.code));
}

export async function fetchUsdKrwSnapshot() {
  const receivedAt = new Date();
  const payload = await fetchUsJson<{
    result?: string;
    rates?: { KRW?: number };
    time_last_update_unix?: number;
  }>("https://open.er-api.com/v6/latest/USD");
  const rate = payload.rates?.KRW;
  if (!rate || !Number.isFinite(rate)) throw new Error("원/달러 환율을 불러오지 못했습니다.");
  const quotedAt = payload.time_last_update_unix
    ? new Date(payload.time_last_update_unix * 1000)
    : receivedAt;
  return {
    rate,
    rateText: rate.toFixed(8),
    source: "open.er-api.com",
    quotedAt,
    receivedAt,
  };
}

let usdKrwRateCache: { expiresAt: number; rate: number } | null = null;
let usdKrwRateRequest: Promise<number> | null = null;

export async function fetchUsdKrwRate(): Promise<number> {
  if (usdKrwRateCache && usdKrwRateCache.expiresAt > Date.now()) return usdKrwRateCache.rate;
  if (!usdKrwRateRequest) {
    usdKrwRateRequest = fetchUsdKrwSnapshot()
      .then((snapshot) => {
        usdKrwRateCache = { rate: snapshot.rate, expiresAt: Date.now() + 5 * 60_000 };
        return snapshot.rate;
      })
      .finally(() => { usdKrwRateRequest = null; });
  }
  return usdKrwRateRequest;
}

/** Nasdaq's quote metadata includes the current NDX constituent flag. */
export async function fetchNasdaq100Membership(code: string): Promise<boolean> {
  const payload = await fetchUsJson<{
    data?: { isNasdaq100?: boolean; symbol?: string };
  }>(`https://api.nasdaq.com/api/quote/${encodeURIComponent(code.toLowerCase())}/info?assetclass=stocks`);
  return payload.data?.isNasdaq100 === true;
}

export type SecurityClassification = Pick<Ticker, "sector" | "industry" | "themes">;

function inferThemes(...parts: Array<string | undefined>): string[] {
  // "제약용 포장재"처럼 제품의 사용처를 나타내는 표현은 제약·바이오
  // 사업 영위와 다르므로 테마 판정 전에 제외한다.
  const source = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("제약용", "")
    .replaceAll("pharmaceutical packaging", "");
  const rules: Array<[string, RegExp]> = [
    ["AI", /\bai\b|artificial intelligence|인공지능|생성형/],
    ["반도체", /semiconductor|chip|반도체|파운드리/],
    ["2차전지", /battery|secondary battery|\blib\b|lithium[- ]ion|2차전지|이차전지|배터리|양극재|음극재|전지재료|전구체/],
    ["바이오·헬스케어", /biotech|biopharma|pharma|healthcare|제약|바이오|의료/],
    ["로봇·자동화", /robot|automation|로봇|자동화/],
    ["전기차", /electric vehicle|\bev\b|전기차/],
    ["방산", /defen[cs]e|aerospace|방산|항공우주/],
    ["원전·전력", /nuclear|power grid|utility|원전|전력/],
    ["클라우드", /cloud|saas|클라우드/],
    ["금융", /bank|insurance|financial|은행|보험|금융/],
    ["게임·콘텐츠", /game|gaming|entertainment|게임|콘텐츠/],
  ];
  return rules.filter(([, pattern]) => pattern.test(source)).map(([theme]) => theme).slice(0, 3);
}

const koreanClassificationCache = new Map<string, { expiresAt: number; classification: SecurityClassification }>();

async function fetchKoreanClassification(code: string, name: string): Promise<SecurityClassification> {
  const cached = koreanClassificationCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.classification;
  const response = await fetch(`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(code)}`, {
    headers: NAVER_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Korean classification request failed (${response.status})`);
  const html = await response.text();
  const sector = html.match(/업종명\s*:\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
  const overviewHtml = html.match(/<div id="summary_info"[\s\S]*?<div class="txt_notice">/)?.[0] ?? "";
  const overview = overviewHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const classification = { sector, themes: inferThemes(name, sector, overview) };
  if (koreanClassificationCache.size >= 500) koreanClassificationCache.delete(koreanClassificationCache.keys().next().value!);
  koreanClassificationCache.set(code, { classification, expiresAt: Date.now() + 6 * 60 * 60_000 });
  return classification;
}

const usClassificationCache = new Map<string, { expiresAt: number; classification: SecurityClassification }>();

async function fetchUsClassification(code: string, name: string): Promise<SecurityClassification> {
  const cached = usClassificationCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.classification;
  const payload = await fetchUsJson<{
    data?: { Sector?: { value?: string }; Industry?: { value?: string }; CompanyDescription?: { value?: string } };
  }>(`https://api.nasdaq.com/api/company/${encodeURIComponent(code.toLowerCase())}/company-profile`);
  const sector = payload.data?.Sector?.value?.trim();
  const industry = payload.data?.Industry?.value?.trim();
  const description = payload.data?.CompanyDescription?.value;
  const classification = { sector, industry, themes: inferThemes(name, sector, industry, description) };
  if (usClassificationCache.size >= 500) usClassificationCache.delete(usClassificationCache.keys().next().value!);
  usClassificationCache.set(code, { classification, expiresAt: Date.now() + 6 * 60 * 60_000 });
  return classification;
}

export async function fetchSecurityClassification(ticker: Pick<Ticker, "code" | "name" | "market" | "assetType">): Promise<SecurityClassification> {
  if (ticker.assetType === "ETF" && ticker.market === "US_ETF") {
    return { sector: "ETF", themes: inferThemes(ticker.name) };
  }
  return ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
    ? fetchKoreanClassification(ticker.code, ticker.name)
    : fetchUsClassification(ticker.code, ticker.name);
}

let searchUniverseCache: { expiresAt: number; tickers: Ticker[] } | null = null;
let searchUniverseRequest: Promise<Ticker[]> | null = null;
let searchIndexRefreshRequest: Promise<{ count: number; refreshedAt: Date }> | null = null;
let searchIndexStorageRequest: Promise<void> | null = null;

/**
 * Called only by the authenticated internal cron endpoint. It repairs a
 * historical production database where the migration journal existed but the
 * search-index table did not, without exposing DDL to browser requests.
 */
export async function ensureSearchIndexStorage() {
  if (searchIndexStorageRequest) return searchIndexStorageRequest;
  searchIndexStorageRequest = (async () => {
    const database = getDb();
    await database.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS "market_search_index" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "code" varchar(16) NOT NULL,
        "normalized_name" varchar(160) NOT NULL,
        "initial_consonants" varchar(160),
        "security_name" varchar(160) NOT NULL,
        "market" varchar(16) NOT NULL,
        "asset_type" varchar(8) NOT NULL,
        "market_cap" double precision DEFAULT 0 NOT NULL,
        "price" double precision DEFAULT 0 NOT NULL,
        "currency" varchar(3),
        "source_updated_at" timestamp with time zone NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "market_search_index_code_nonempty" CHECK (length(trim("code")) > 0),
        CONSTRAINT "market_search_index_name_nonempty" CHECK (length(trim("security_name")) > 0)
      )
    `));
    await database.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "market_search_index_market_code_unique" ON "market_search_index" ("market", "code")`));
    await database.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "market_search_index_name_idx" ON "market_search_index" ("normalized_name")`));
    await database.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "market_search_index_initials_idx" ON "market_search_index" ("initial_consonants")`));
    await database.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "market_search_index_source_updated_idx" ON "market_search_index" ("source_updated_at")`));
  })().catch((error) => {
    searchIndexStorageRequest = null;
    throw error;
  });
  return searchIndexStorageRequest;
}

async function getSearchUniverse(): Promise<Ticker[]> {
  if (searchUniverseCache && searchUniverseCache.expiresAt > Date.now()) {
    return searchUniverseCache.tickers;
  }
  if (!searchUniverseRequest) {
    searchUniverseRequest = Promise.all([fetchUniverse("all", "all"), fetchUsUniverse("all", "all")])
      .then(([kr, us]) => [...kr, ...us])
      .then((tickers) => {
        searchUniverseCache = { expiresAt: Date.now() + 5 * 60_000, tickers };
        return tickers;
      })
      .finally(() => {
        searchUniverseRequest = null;
      });
  }
  return searchUniverseRequest;
}

function normalizedSearchText(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "");
}

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_INITIAL_CONSONANTS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function koreanInitialConsonants(value: string) {
  return Array.from(value).map((character) => {
    const codePoint = character.charCodeAt(0);
    if (codePoint < HANGUL_SYLLABLE_START || codePoint > HANGUL_SYLLABLE_END) return character.toLowerCase();
    return HANGUL_INITIAL_CONSONANTS[Math.floor((codePoint - HANGUL_SYLLABLE_START) / 588)];
  }).join("");
}

function isKoreanInitialQuery(value: string) {
  return /^[ㄱ-ㅎ]+$/u.test(value);
}

function rankSearchResults(tickers: Ticker[], normalized: string, limit: number) {
  const initialQuery = isKoreanInitialQuery(normalized);
  const rank = (ticker: Ticker) => {
    const code = ticker.code.toLowerCase();
    const name = normalizedSearchText(ticker.name);
    const initials = koreanInitialConsonants(ticker.name);
    if (code === normalized || name === normalized) return 0;
    if (initialQuery && initials === normalized) return 0;
    if (code.startsWith(normalized)) return 1;
    if (initialQuery && initials.startsWith(normalized)) return 1;
    if (name.startsWith(normalized)) return 2;
    return 3;
  };
  return tickers
    .filter((ticker) => {
      const code = ticker.code.toLowerCase();
      const name = normalizedSearchText(ticker.name);
      return code.includes(normalized) || name.includes(normalized)
        || (initialQuery && koreanInitialConsonants(ticker.name).includes(normalized));
    })
    .sort((a, b) => rank(a) - rank(b) || b.marketCap - a.marketCap || a.code.localeCompare(b.code))
    .slice(0, Math.max(1, Math.min(limit, 20)));
}

async function searchIndexedUniverse(normalized: string): Promise<Ticker[] | null> {
  try {
    const database = getDb();
    const initialQuery = isKoreanInitialQuery(normalized);
    const rows = await database
      .select()
      .from(marketSearchIndex)
      .where(initialQuery
        ? sql`position(${normalized} in coalesce(${marketSearchIndex.initialConsonants}, '')) > 0`
        : sql`position(${normalized} in lower(${marketSearchIndex.code})) > 0 or position(${normalized} in ${marketSearchIndex.normalizedName}) > 0`)
      .limit(100);
    if (rows.length) {
      return rows.map((row) => ({
        code: row.code,
        name: row.securityName,
        market: row.market as Market,
        assetType: row.assetType as AssetType,
        marketCap: row.marketCap,
        price: row.price,
        currency: row.currency === "KRW" || row.currency === "USD" ? row.currency : undefined,
      }));
    }
    const [existing] = await database
      .select({ code: marketSearchIndex.code })
      .from(marketSearchIndex)
      .where(initialQuery ? sql`${marketSearchIndex.initialConsonants} is not null` : undefined)
      .limit(1);
    return existing ? [] : null;
  } catch {
    // The index is optional until its first migration and refresh complete. Keep
    // search available through the existing provider path during that window.
    return null;
  }
}

export async function refreshSearchIndex(): Promise<{ count: number; refreshedAt: Date }> {
  if (searchIndexRefreshRequest) return searchIndexRefreshRequest;
  searchIndexRefreshRequest = (async () => {
    const tickers = await getSearchUniverse();
    // Provider universes can overlap (for example, an instrument present in
    // two category feeds). PostgreSQL rejects an UPSERT batch that attempts to
    // update the same (market, code) row twice, so keep one canonical record.
    const uniqueTickers = [...new Map(
      tickers.map((ticker) => [`${ticker.market}:${ticker.code.toUpperCase()}`, ticker]),
    ).values()];
    const refreshedAt = new Date();
    const database = getDb();
    const batchSize = 500;
    for (let offset = 0; offset < uniqueTickers.length; offset += batchSize) {
      const batch = uniqueTickers.slice(offset, offset + batchSize).map((ticker) => ({
        code: ticker.code.toUpperCase(),
        normalizedName: normalizedSearchText(ticker.name),
        initialConsonants: koreanInitialConsonants(ticker.name),
        securityName: ticker.name,
        market: ticker.market,
        assetType: ticker.assetType,
        marketCap: ticker.marketCap,
        price: ticker.price,
        currency: ticker.currency,
        sourceUpdatedAt: refreshedAt,
        updatedAt: refreshedAt,
      }));
      await database.insert(marketSearchIndex).values(batch).onConflictDoUpdate({
        target: [marketSearchIndex.market, marketSearchIndex.code],
        set: {
          normalizedName: sql`excluded.normalized_name`,
          initialConsonants: sql`excluded.initial_consonants`,
          securityName: sql`excluded.security_name`,
          assetType: sql`excluded.asset_type`,
          marketCap: sql`excluded.market_cap`,
          price: sql`excluded.price`,
          currency: sql`excluded.currency`,
          sourceUpdatedAt: sql`excluded.source_updated_at`,
          updatedAt: refreshedAt,
        },
      });
    }
    return { count: uniqueTickers.length, refreshedAt };
  })().finally(() => {
    searchIndexRefreshRequest = null;
  });
  return searchIndexRefreshRequest;
}

export async function searchUniverse(query: string, limit = 8): Promise<Ticker[]> {
  const normalized = normalizedSearchText(query);
  if (!normalized) return [];
  const indexed = await searchIndexedUniverse(normalized);
  if (indexed) return rankSearchResults(indexed, normalized, limit);

  // A newly migrated environment has no rows until the first scheduled refresh.
  // Use the current request as a one-time bootstrap so users do not have to wait
  // for tomorrow's cron run; subsequent searches use the database index.
  const liveTickers = await getSearchUniverse();
  try {
    await refreshSearchIndex();
  } catch {
    // Provider search remains available even if index persistence is temporarily
    // unavailable, and the next scheduled refresh will retry it.
  }
  return rankSearchResults(liveTickers, normalized, limit);
}

export function historyYears(timeframe: Timeframe, maPeriod: number): number {
  if (timeframe === "monthly") return Math.max(3, Math.ceil(maPeriod / 12) + 2);
  return Math.max(3, Math.ceil((maPeriod * 7) / 365) + 2);
}

function compactDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

const KOREAN_CHART_CACHE_MS = 5 * 60_000;
const koreanChartCache = new Map<string, { expiresAt: number; rows: DailyRow[] }>();
const koreanChartRequests = new Map<string, Promise<DailyRow[]>>();

async function fetchDailyChartUncached(code: string, years: number): Promise<DailyRow[]> {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  const url =
    `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/day` +
    `?startDateTime=${compactDate(start)}000000&endDateTime=${compactDate(end)}235959`;
  const payload = await fetchJson<unknown>(url);
  return Array.isArray(payload) ? (payload as DailyRow[]) : [];
}

export async function fetchDailyChart(code: string, years: number, useCache = true): Promise<DailyRow[]> {
  if (!useCache) return fetchDailyChartUncached(code, years);
  const normalizedCode = code.trim().toUpperCase();
  const key = `${normalizedCode}:${years}`;
  const cached = koreanChartCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = koreanChartRequests.get(key);
  if (pending) return pending;
  const request = fetchDailyChartUncached(normalizedCode, years)
    .then((rows) => {
      if (koreanChartCache.size >= 60) koreanChartCache.delete(koreanChartCache.keys().next().value!);
      koreanChartCache.set(key, { rows, expiresAt: Date.now() + KOREAN_CHART_CACHE_MS });
      return rows;
    })
    .finally(() => { koreanChartRequests.delete(key); });
  koreanChartRequests.set(key, request);
  return request;
}

const US_CHART_CACHE_MS = 5 * 60_000;
const usChartCache = new Map<string, { expiresAt: number; rows: DailyRow[] }>();
const usChartRequests = new Map<string, Promise<DailyRow[]>>();

async function fetchUsDailyChartUncached(code: string, years: number, assetType: AssetType): Promise<DailyRow[]> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - years);
  const toDate = (date: Date) => date.toISOString().slice(0, 10);
  type HistoricalRow = { date?: string; open?: string; high?: string; low?: string; close?: string; volume?: string };
  const payload = await fetchUsJson<{ data?: { tradesTable?: { rows?: HistoricalRow[] } } }>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(code.toLowerCase())}/historical?assetclass=${assetType === "ETF" ? "etf" : "stocks"}&fromdate=${toDate(startDate)}&todate=${toDate(endDate)}&limit=5000`,
  );
  const rows = payload.data?.tradesTable?.rows ?? [];
  return rows.map((row) => {
    const parts = String(row.date ?? "").split("/");
    const date = parts.length === 3 ? `${parts[2]}${parts[0].padStart(2, "0")}${parts[1].padStart(2, "0")}` : "";
    return {
      localDate: date,
      openPrice: usdNumber(row.open),
      highPrice: usdNumber(row.high),
      lowPrice: usdNumber(row.low),
      closePrice: usdNumber(row.close),
      accumulatedTradingVolume: numeric(row.volume),
    };
  });
}

export async function fetchUsDailyChart(code: string, years: number, assetType: AssetType = "STOCK", useCache = true): Promise<DailyRow[]> {
  if (!useCache) return fetchUsDailyChartUncached(code, years, assetType);
  const normalizedCode = code.trim().toUpperCase();
  const key = `${assetType}:${normalizedCode}:${years}`;
  const cached = usChartCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = usChartRequests.get(key);
  if (pending) return pending;
  const request = fetchUsDailyChartUncached(normalizedCode, years, assetType)
    .then((rows) => {
      if (usChartCache.size >= 60) usChartCache.delete(usChartCache.keys().next().value!);
      usChartCache.set(key, { rows, expiresAt: Date.now() + US_CHART_CACHE_MS });
      return rows;
    })
    .finally(() => { usChartRequests.delete(key); });
  usChartRequests.set(key, request);
  return request;
}

export async function fetchTickerDailyChart(ticker: Pick<Ticker, "code" | "market" | "assetType">, years: number, useCache = true): Promise<DailyRow[]> {
  return ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
    ? fetchDailyChart(ticker.code, years, useCache)
    : fetchUsDailyChart(ticker.code, years, ticker.assetType, useCache);
}

function quoteDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function fetchTradingQuote(
  symbolValue: string,
  marketValue: Market,
  now = new Date(),
): Promise<TradingQuote> {
  const symbol = symbolValue.trim().toUpperCase();
  const isKoreanMarket = marketValue === "KOSPI" || marketValue === "KOSDAQ";
  const candidates = isKoreanMarket
    ? await fetchUniverse(marketValue.toLowerCase() as MarketFilter, "all")
    : marketValue === "US_ETF"
      ? await fetchUsUniverse("all", "etp")
      : await fetchUsUniverse(marketValue.toLowerCase() as MarketFilter, "stock");
  const ticker = candidates.find(
    (candidate) =>
      candidate.code === symbol &&
      candidate.market === marketValue &&
      (candidate.assetType === "STOCK" || candidate.assetType === "ETF"),
  );
  if (!ticker) {
    throw new MarketQuoteError(
      "UNSUPPORTED_SECURITY",
      "모의투자는 한국·미국 주식과 ETF를 지원합니다.",
    );
  }

  const rows = await fetchTickerDailyChart(ticker, 1, false);
  const latest = aggregateCandles(rows, "daily").at(-1);
  const quotedAt = latest ? quoteDate(latest.date) : null;
  if (!latest || latest.close <= 0 || !quotedAt) {
    throw new MarketQuoteError("QUOTE_UNAVAILABLE", "체결에 사용할 시세가 없습니다.");
  }

  const quoteAgeMs = now.getTime() - quotedAt.getTime();
  if (quoteAgeMs < -36 * 60 * 60 * 1000 || quoteAgeMs > 8 * 24 * 60 * 60 * 1000) {
    throw new MarketQuoteError(
      "STALE_QUOTE",
      "최근 8일 이내의 종가가 없어 주문을 체결할 수 없습니다.",
    );
  }

  const nativeCurrency = ticker.currency === "USD" ? "USD" : "KRW";
  const nativePrice = latest.close.toFixed(nativeCurrency === "KRW" ? 0 : 6);
  if (nativeCurrency === "KRW") {
    return {
      ticker,
      nativePrice,
      nativeCurrency,
      quoteSource: "naver-domestic-day",
      quoteAt: quotedAt,
      quoteReceivedAt: now,
      fxRate: "1.00000000",
      fxSource: "identity-KRW",
      fxAt: quotedAt,
      fxReceivedAt: now,
    };
  }

  const fx = await fetchUsdKrwSnapshot();
  const fxAgeMs = now.getTime() - fx.quotedAt.getTime();
  if (fxAgeMs < -36 * 60 * 60 * 1000 || fxAgeMs > 5 * 24 * 60 * 60 * 1000) {
    throw new MarketQuoteError(
      "STALE_FX",
      "최근 5일 이내의 원/달러 환율이 없어 주문을 체결할 수 없습니다.",
    );
  }

  return {
    ticker,
    nativePrice,
    nativeCurrency,
    quoteSource: "nasdaq-historical-day",
    quoteAt: quotedAt,
    quoteReceivedAt: now,
    fxRate: fx.rateText,
    fxSource: fx.source,
    fxAt: fx.quotedAt,
    fxReceivedAt: fx.receivedAt,
  };
}

function isoWeekKey(value: Date): string {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function aggregateCandles(rows: DailyRow[], timeframe: ChartTimeframe): PeriodCandle[] {
  const parsed = rows
    .map((row) => {
      const raw = String(row.localDate ?? "");
      if (!/^\d{8}$/.test(raw)) return null;
      const date = new Date(
        Number(raw.slice(0, 4)),
        Number(raw.slice(4, 6)) - 1,
        Number(raw.slice(6, 8)),
      );
      const candle = {
        date,
        dateText: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
        open: numeric(row.openPrice),
        high: numeric(row.highPrice),
        low: numeric(row.lowPrice),
        close: numeric(row.closePrice),
        volume: numeric(row.accumulatedTradingVolume),
      };
      return Math.min(candle.open, candle.high, candle.low, candle.close) > 0
        ? candle
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const grouped = new Map<string, typeof parsed>();
  for (const row of parsed) {
    const key =
      timeframe === "daily"
        ? row.dateText
        : timeframe === "weekly"
        ? isoWeekKey(row.date)
        : `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => ({
    date: group.at(-1)!.dateText,
    open: group[0].open,
    high: Math.max(...group.map((row) => row.high)),
    low: Math.min(...group.map((row) => row.low)),
    close: group.at(-1)!.close,
    volume: group.reduce((sum, row) => sum + row.volume, 0),
  }));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function screenCandles(
  ticker: Ticker,
  candles: PeriodCandle[],
  maPeriod: MovingAveragePeriod,
  timeframe: Timeframe,
): Candidate | null {
  if (candles.length < maPeriod + 1) return null;
  const previous = candles.at(-2)!;
  const current = candles.at(-1)!;
  const previousMa = average(candles.slice(-maPeriod - 1, -1).map((row) => row.close));
  const ma = average(candles.slice(-maPeriod).map((row) => row.close));
  if (!(previous.close <= previousMa && current.close > ma)) return null;

  const gapPct = ((current.close - ma) / ma) * 100;
  const volumeChangePct =
    previous.volume > 0 ? ((current.volume - previous.volume) / previous.volume) * 100 : null;
  const volumeStatus =
    volumeChangePct === null
      ? "비교 불가"
      : current.volume > previous.volume
        ? "증가"
        : current.volume < previous.volume
          ? "감소"
          : "동일";
  const status = gapPct <= 3 ? "근접 돌파" : gapPct >= 8 ? "추격 주의" : "상승 진행";

  return {
    ...ticker,
    price: current.close,
    timeframe,
    maPeriod,
    date: current.date,
    previousClose: previous.close,
    previousMa,
    close: current.close,
    ma,
    gapPct,
    previousVolume: previous.volume,
    volume: current.volume,
    volumeChangePct,
    volumeStatus,
    status,
  };
}

function movingAverageAt(candles: PeriodCandle[], index: number, period: number): number | null {
  if (index + 1 < period) return null;
  return average(candles.slice(index + 1 - period, index + 1).map((row) => row.close));
}

export function withMovingAverages(candles: PeriodCandle[]): ChartPoint[] {
  return candles.map((candle, index) => ({
    ...candle,
    ma5: movingAverageAt(candles, index, 5),
    ma10: movingAverageAt(candles, index, 10),
    ma240: movingAverageAt(candles, index, 240),
  }));
}

export async function screenTicker(
  ticker: Ticker,
  timeframe: Timeframe,
  maPeriod: MovingAveragePeriod,
): Promise<Candidate | null> {
  const daily = await fetchTickerDailyChart(ticker, historyYears(timeframe, maPeriod));
  return screenCandles(ticker, aggregateCandles(daily, timeframe), maPeriod, timeframe);
}
