export type Market = "KOSPI" | "KOSDAQ";
export type MarketFilter = "all" | "kospi" | "kosdaq";
export type AssetType = "STOCK" | "ETF" | "ETN";
export type AssetFilter = "all" | "stock" | "etp";
export type Timeframe = "weekly" | "monthly";
export type ChartTimeframe = "daily" | Timeframe;
export type ScreeningTimeframe = Timeframe | "both";
export type MovingAveragePeriod = 10 | 240;
export type ScreeningMaPeriod = MovingAveragePeriod | "both";
export type PatternFilter = "none" | "inverse_head_shoulders" | "head_shoulders" | "both";

export type Ticker = {
  code: string;
  name: string;
  market: Market;
  assetType: AssetType;
  marketCap: number;
  price: number;
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
  pattern?: PatternSignal;
};

export type PatternSignal = {
  type: Exclude<PatternFilter, "none" | "both">;
  label: "역헤드앤숄더" | "헤드앤숄더";
  leftDate: string;
  headDate: string;
  rightDate: string;
  neckline: number;
  score: number;
};

const NAVER_HEADERS = {
  accept: "application/json",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
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

let searchUniverseCache: { expiresAt: number; tickers: Ticker[] } | null = null;
let searchUniverseRequest: Promise<Ticker[]> | null = null;

async function getSearchUniverse(): Promise<Ticker[]> {
  if (searchUniverseCache && searchUniverseCache.expiresAt > Date.now()) {
    return searchUniverseCache.tickers;
  }
  if (!searchUniverseRequest) {
    searchUniverseRequest = fetchUniverse("all", "all")
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

function findPivots(candles: PeriodCandle[], direction: "high" | "low", radius = 3) {
  const pivots: number[] = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const price = candles[index][direction];
    const neighborhood = candles.slice(index - radius, index + radius + 1).map((candle) => candle[direction]);
    const isPivot = direction === "low" ? price === Math.min(...neighborhood) : price === Math.max(...neighborhood);
    if (isPivot) pivots.push(index);
  }
  return pivots;
}

function detectHeadAndShoulders(candles: PeriodCandle[], inverse: boolean): PatternSignal | null {
  const start = Math.max(0, candles.length - 220);
  const recent = candles.slice(start);
  const pivotDirection = inverse ? "low" : "high";
  const pivots = findPivots(recent, pivotDirection);
  let best: PatternSignal | null = null;

  for (let leftPosition = 0; leftPosition < pivots.length - 2; leftPosition += 1) {
    for (let headPosition = leftPosition + 1; headPosition < pivots.length - 1; headPosition += 1) {
      for (let rightPosition = headPosition + 1; rightPosition < pivots.length; rightPosition += 1) {
        const leftIndex = pivots[leftPosition];
        const headIndex = pivots[headPosition];
        const rightIndex = pivots[rightPosition];
        if (headIndex - leftIndex < 8 || rightIndex - headIndex < 8 || rightIndex - leftIndex > 120) continue;
        if (recent.length - 1 - rightIndex < 3 || recent.length - 1 - rightIndex > 70) continue;

        const left = recent[leftIndex][pivotDirection];
        const head = recent[headIndex][pivotDirection];
        const right = recent[rightIndex][pivotDirection];
        const shoulderAverage = (left + right) / 2;
        const shoulderDifference = Math.abs(left - right) / Math.max(shoulderAverage, 1);
        if (shoulderDifference > 0.06) continue;
        const headSeparation = inverse
          ? (Math.min(left, right) - head) / Math.max(Math.min(left, right), 1)
          : (head - Math.max(left, right)) / Math.max(Math.max(left, right), 1);
        if (headSeparation < 0.04) continue;

        const leftNeck = inverse
          ? Math.max(...recent.slice(leftIndex, headIndex + 1).map((candle) => candle.high))
          : Math.min(...recent.slice(leftIndex, headIndex + 1).map((candle) => candle.low));
        const rightNeck = inverse
          ? Math.max(...recent.slice(headIndex, rightIndex + 1).map((candle) => candle.high))
          : Math.min(...recent.slice(headIndex, rightIndex + 1).map((candle) => candle.low));
        const neckline = (leftNeck + rightNeck) / 2;
        const current = recent.at(-1)!;
        const necklineBroken = inverse ? current.close > neckline : current.close < neckline;
        if (!necklineBroken) continue;

        const symmetry = Math.min(headIndex - leftIndex, rightIndex - headIndex) /
          Math.max(headIndex - leftIndex, rightIndex - headIndex);
        const score = Math.round((headSeparation * 100 * 4 + (1 - shoulderDifference / 0.06) * 35 + symmetry * 25) * 10) / 10;
        const signal: PatternSignal = {
          type: inverse ? "inverse_head_shoulders" : "head_shoulders",
          label: inverse ? "역헤드앤숄더" : "헤드앤숄더",
          leftDate: recent[leftIndex].date,
          headDate: recent[headIndex].date,
          rightDate: recent[rightIndex].date,
          neckline,
          score,
        };
        if (!best || signal.score > best.score) best = signal;
      }
    }
  }
  return best;
}

export function detectChartPattern(candles: PeriodCandle[], filter: PatternFilter): PatternSignal | null {
  if (filter === "none") return null;
  const inverse = filter === "head_shoulders" ? null : detectHeadAndShoulders(candles, true);
  if (inverse) return inverse;
  return filter === "inverse_head_shoulders" ? null : detectHeadAndShoulders(candles, false);
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
  patternFilter: PatternFilter = "none",
): Promise<Candidate | null> {
  const requiredYears = Math.max(historyYears(timeframe, maPeriod), patternFilter === "none" ? 0 : 2);
  const daily = await fetchDailyChart(ticker.code, requiredYears);
  const candidate = screenCandles(ticker, aggregateCandles(daily, timeframe), maPeriod, timeframe);
  if (!candidate) return null;
  const pattern = detectChartPattern(aggregateCandles(daily, "daily"), patternFilter);
  return patternFilter === "none" || pattern ? { ...candidate, ...(pattern ? { pattern } : {}) } : null;
}
