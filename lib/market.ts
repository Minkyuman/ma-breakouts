export type Region = "kr" | "us";
export type Market = "KOSPI" | "KOSDAQ" | "NASDAQ" | "NYSE" | "AMEX";
export type MarketFilter = "all" | "kospi" | "kosdaq" | "nasdaq" | "nyse" | "amex";
export type AssetType = "STOCK" | "ETF" | "ETN";
export type AssetFilter = "all" | "stock" | "etp";
export type Timeframe = "weekly" | "monthly";
export type ChartTimeframe = "daily" | Timeframe;
export type ScreeningTimeframe = Timeframe | "both";
export type MovingAveragePeriod = 10 | 240;
export type ScreeningMaPeriod = MovingAveragePeriod | "both";

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
  isNasdaq100?: boolean;
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
};

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
    }))
    .filter((ticker) => ticker.code && ticker.price > 0);
}

/**
 * The first rollout scans the liquid, largest 1,000 names per exchange.
 * This keeps a browser-triggered scan responsive while the provider layer remains
 * compatible with a future scheduled full-market batch.
 */
export async function fetchUsUniverse(filter: MarketFilter, assetFilter: AssetFilter = "stock"): Promise<Ticker[]> {
  if (assetFilter === "etp") return [];
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

export async function fetchUsdKrwRate(): Promise<number> {
  return (await fetchUsdKrwSnapshot()).rate;
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

async function fetchKoreanClassification(code: string, name: string): Promise<SecurityClassification> {
  const response = await fetch(`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(code)}`, {
    headers: NAVER_HEADERS,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Korean classification request failed (${response.status})`);
  const html = await response.text();
  const sector = html.match(/업종명\s*:\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
  const overviewHtml = html.match(/<div id="summary_info"[\s\S]*?<div class="txt_notice">/)?.[0] ?? "";
  const overview = overviewHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { sector, themes: inferThemes(name, sector, overview) };
}

async function fetchUsClassification(code: string, name: string): Promise<SecurityClassification> {
  const payload = await fetchUsJson<{
    data?: { Sector?: { value?: string }; Industry?: { value?: string }; CompanyDescription?: { value?: string } };
  }>(`https://api.nasdaq.com/api/company/${encodeURIComponent(code.toLowerCase())}/company-profile`);
  const sector = payload.data?.Sector?.value?.trim();
  const industry = payload.data?.Industry?.value?.trim();
  const description = payload.data?.CompanyDescription?.value;
  return { sector, industry, themes: inferThemes(name, sector, industry, description) };
}

export async function fetchSecurityClassification(ticker: Pick<Ticker, "code" | "name" | "market">): Promise<SecurityClassification> {
  return ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
    ? fetchKoreanClassification(ticker.code, ticker.name)
    : fetchUsClassification(ticker.code, ticker.name);
}

let searchUniverseCache: { expiresAt: number; tickers: Ticker[] } | null = null;
let searchUniverseRequest: Promise<Ticker[]> | null = null;

async function getSearchUniverse(): Promise<Ticker[]> {
  if (searchUniverseCache && searchUniverseCache.expiresAt > Date.now()) {
    return searchUniverseCache.tickers;
  }
  if (!searchUniverseRequest) {
    searchUniverseRequest = Promise.all([fetchUniverse("all", "all"), fetchUsUniverse("all", "stock")])
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

export async function searchUniverse(query: string, limit = 8): Promise<Ticker[]> {
  const normalized = query.trim().toLowerCase().replaceAll(" ", "");
  if (!normalized) return [];
  const tickers = await getSearchUniverse();
  const rank = (ticker: Ticker) => {
    const code = ticker.code.toLowerCase();
    const name = ticker.name.toLowerCase().replaceAll(" ", "");
    if (code === normalized || name === normalized) return 0;
    if (code.startsWith(normalized)) return 1;
    if (name.startsWith(normalized)) return 2;
    return 3;
  };
  return tickers
    .filter((ticker) => {
      const code = ticker.code.toLowerCase();
      const name = ticker.name.toLowerCase().replaceAll(" ", "");
      return code.includes(normalized) || name.includes(normalized);
    })
    .sort((a, b) => rank(a) - rank(b) || b.marketCap - a.marketCap || a.code.localeCompare(b.code))
    .slice(0, Math.max(1, Math.min(limit, 20)));
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

export async function fetchDailyChart(code: string, years: number): Promise<DailyRow[]> {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  const url =
    `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/day` +
    `?startDateTime=${compactDate(start)}000000&endDateTime=${compactDate(end)}235959`;
  const payload = await fetchJson<unknown>(url);
  return Array.isArray(payload) ? (payload as DailyRow[]) : [];
}

export async function fetchUsDailyChart(code: string, years: number): Promise<DailyRow[]> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - years);
  const toDate = (date: Date) => date.toISOString().slice(0, 10);
  type HistoricalRow = { date?: string; open?: string; high?: string; low?: string; close?: string; volume?: string };
  const payload = await fetchUsJson<{ data?: { tradesTable?: { rows?: HistoricalRow[] } } }>(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(code.toLowerCase())}/historical?assetclass=stocks&fromdate=${toDate(startDate)}&todate=${toDate(endDate)}&limit=5000`,
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

export async function fetchTickerDailyChart(ticker: Pick<Ticker, "code" | "market">, years: number): Promise<DailyRow[]> {
  return ticker.market === "KOSPI" || ticker.market === "KOSDAQ"
    ? fetchDailyChart(ticker.code, years)
    : fetchUsDailyChart(ticker.code, years);
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
    : await fetchUsUniverse(marketValue.toLowerCase() as MarketFilter, "stock");
  const ticker = candidates.find(
    (candidate) =>
      candidate.code === symbol &&
      candidate.market === marketValue &&
      (candidate.assetType === "STOCK" || (isKoreanMarket && candidate.assetType === "ETF")),
  );
  if (!ticker) {
    throw new MarketQuoteError(
      "UNSUPPORTED_SECURITY",
      "모의투자는 한국 주식·ETF와 미국 보통주를 지원합니다.",
    );
  }

  const rows = await fetchTickerDailyChart(ticker, 1);
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
