"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AuthUser } from "@/lib/auth";
import type { FavoriteList } from "@/lib/favorites";
import type { GameOverview } from "@/lib/game";
import type { LeagueOverview, PublicPlayerDetail } from "@/lib/game-league";
import type { LeagueResearchNote, ResearchNotesPage } from "@/lib/game-research";
import type { PortfolioDashboard, TradeReceipt, TradeSide } from "@/lib/game-trading";
import type { StockDeepAnalysis } from "@/lib/stock-analysis";
import type {
  AssetFilter,
  Candidate,
  ChartTimeframe,
  ChartPoint,
  MarketFilter,
  Region,
  SecurityClassification,
  ScreeningMaPeriod,
  ScreeningTimeframe,
  Ticker,
} from "@/lib/market";

type MarketWatch = {
  id: string;
  name: string;
  shortName: string;
  unit: "pt" | "원" | "%" | "USD";
  group: "korea" | "global-index" | "global-indicator";
};

type AdminGameOverview = {
  analysisModel: {
    selectedModel: string;
    suggestions: string[];
  };
  seasons: Array<{
    id: string;
    slug: string;
    name: string;
    status: "draft" | "open" | "closed" | "archived";
    startsAt: string;
    endsAt: string;
    initialCashKrw: string;
    ruleVersion: number;
    participantCount: number;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    requestId: string;
    metadata: Record<string, string | number | boolean | null>;
    createdAt: string;
  }>;
};

type AccessRequest = {
  id: string;
  email: string;
  displayName: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  decidedAt: string | null;
};

function AccessRequestAdminSection({ requests, savingId, onDecide }: { requests: AccessRequest[]; savingId: string | null; onDecide: (id: string, status: "approved" | "rejected") => void }) {
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const processedRequests = requests.filter((request) => request.status !== "pending");
  return <section className="access-request-admin">
    <div className="access-request-admin-head"><div><span>MEMBER ACCESS</span><strong>서비스 접근 요청</strong></div><small>대기 요청만 바로 처리합니다.</small></div>
    {pendingRequests.length ? <div className="access-request-list">{pendingRequests.map((request) => <article key={request.id} className={request.status}>
      <div><strong>{request.displayName || "이름 없음"}</strong><small>{request.email}</small><time>요청 {new Date(request.requestedAt).toLocaleString("ko-KR")}</time></div>
      <div><span>{request.status === "pending" ? "대기" : request.status === "approved" ? "승인" : "거절"}</span>{request.status === "pending" && <p><button type="button" disabled={savingId === request.id} onClick={() => onDecide(request.id, "approved")}>승인</button><button type="button" disabled={savingId === request.id} onClick={() => onDecide(request.id, "rejected")}>거절</button></p>}</div>
    </article>)}</div> : <p className="league-empty-copy">대기 중인 접근 요청이 없습니다.</p>}
    {processedRequests.length > 0 && <details className="access-request-history"><summary>처리 이력 {processedRequests.length.toLocaleString("ko-KR")}건 보기</summary><div className="access-request-list">{processedRequests.map((request) => <article key={request.id} className={request.status}>
      <div><strong>{request.displayName || "이름 없음"}</strong><small>{request.email}</small><time>{request.status === "approved" ? "승인" : "거절"} {request.decidedAt ? new Date(request.decidedAt).toLocaleString("ko-KR") : "시각 미확인"}</time></div>
      <div><span>{request.status === "approved" ? "승인" : "거절"}</span></div>
    </article>)}</div></details>}
  </section>;
}

const QUICK_BUY_ALLOCATIONS = [
  { label: "10%", value: 10 },
  { label: "25%", value: 25 },
  { label: "50%", value: 50 },
  { label: "최대", value: 100 },
] as const;

const RESEARCH_FEED_INITIAL_COUNT = 5;
const RESEARCH_FEED_STEP = 5;

type QuickBuyAllocation = (typeof QUICK_BUY_ALLOCATIONS)[number]["value"];

const MARKET_WATCHES: MarketWatch[] = [
  { id: "kospi", name: "코스피", shortName: "KOSPI", unit: "pt", group: "korea" },
  { id: "kosdaq", name: "코스닥", shortName: "KOSDAQ", unit: "pt", group: "korea" },
  { id: "sp500", name: "S&P 500", shortName: "S&P 500", unit: "pt", group: "global-index" },
  { id: "nasdaq100", name: "나스닥 100", shortName: "NASDAQ 100", unit: "pt", group: "global-index" },
  { id: "nasdaq", name: "나스닥 종합", shortName: "NASDAQ", unit: "pt", group: "global-index" },
  { id: "dow", name: "다우존스", shortName: "DOW", unit: "pt", group: "global-index" },
  { id: "russell", name: "러셀 2000", shortName: "RUSSELL 2000", unit: "pt", group: "global-index" },
  { id: "sox", name: "필라델피아 반도체", shortName: "SOX", unit: "pt", group: "global-index" },
  { id: "taiex", name: "대만 가권지수", shortName: "TAIEX", unit: "pt", group: "global-index" },
  { id: "csi300", name: "중국 CSI 300", shortName: "CSI 300", unit: "pt", group: "global-index" },
  { id: "hangsengtech", name: "항셍테크 ETF 추적", shortName: "HSTECH ETF", unit: "pt", group: "global-index" },
  { id: "nikkei", name: "일본 닛케이 225", shortName: "NIKKEI 225", unit: "pt", group: "global-index" },
  { id: "nasdaqfutures", name: "나스닥 100 선물", shortName: "NASDAQ FUT", unit: "pt", group: "global-index" },
  { id: "sp500futures", name: "S&P 500 선물", shortName: "S&P FUT", unit: "pt", group: "global-index" },
  { id: "usdkrw", name: "달러 / 원", shortName: "USD/KRW", unit: "원", group: "global-indicator" },
  { id: "vix", name: "VIX 변동성 지수", shortName: "VIX", unit: "pt", group: "global-indicator" },
  { id: "dxy", name: "달러 인덱스", shortName: "DXY", unit: "pt", group: "global-indicator" },
  { id: "ust10y", name: "미국 10년물 국채금리", shortName: "US 10Y", unit: "%", group: "global-indicator" },
  { id: "wti", name: "WTI 유가", shortName: "WTI", unit: "USD", group: "global-indicator" },
];

function supportsPaperTrading(ticker: Pick<Ticker, "assetType" | "market">) {
  return ticker.assetType === "STOCK" || ticker.assetType === "ETF";
}

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

function formatPrice(value: number) {
  return number.format(Math.round(value));
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatMarketWatchPrice(value: number, unit: MarketWatch["unit"]) {
  if (unit === "USD") return formatUsd(value);
  if (unit === "%") return value.toFixed(2);
  return formatPrice(value);
}

function naverStockPageUrl(ticker: Pick<Ticker, "code" | "currency" | "market">) {
  if (ticker.currency === "USD") {
    return `https://m.stock.naver.com/worldstock/stock/${encodeURIComponent(ticker.code)}/total`;
  }
  return `https://m.stock.naver.com/domestic/stock/${encodeURIComponent(ticker.code)}/total`;
}

function formatMaybePrice(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : formatPrice(value);
}

function formatCap(value: number) {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}조`;
  if (value >= 100_000_000) return `${number.format(value / 100_000_000)}억`;
  return "-";
}

function formatVolume(value: number) {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}천만`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}만`;
  return number.format(value);
}

function formatKrwAmount(value: string) {
  return `${number.format(Number(value))}원`;
}

function formatNativeTradePrice(value: string, currency: string) {
  const price = Number(value);
  if (!Number.isFinite(price)) return "—";
  return currency === "USD"
    ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
    : `${formatPrice(price)}원`;
}

function formatTradeUnitKrw(grossKrw: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 1) return "—";
  return formatKrwAmount(String(Number(grossKrw) / quantity));
}

function signed(value: number | null, digits = 1) {
  if (value === null) return "비교 불가";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function signedPrice(value: number) {
  return `${value >= 0 ? "+" : "−"}${formatPrice(Math.abs(value))}`;
}

function leagueSecurityTicker(security: {
  symbol: string;
  securityName: string;
  market: string;
  nativeCurrency?: string;
  nativePrice?: string;
  assetType?: "STOCK" | "ETF" | "INDEX";
}): Ticker {
  const isUsd = security.nativeCurrency === "USD" || ["NASDAQ", "NYSE", "AMEX", "US_ETF"].includes(security.market);
  return {
    code: security.symbol,
    name: security.securityName,
    market: security.market as Ticker["market"],
    assetType: security.assetType ?? "STOCK",
    marketCap: 0,
    price: Number(security.nativePrice) || 0,
    currency: isUsd ? "USD" : "KRW",
  };
}

function localDateInputValue() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function researchNotePreview(note: string) {
  const plainText = note
    .replace(/```[\s\S]*?```/gu, " 코드 블록 ")
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/gu, " ")
    .replace(/[#>*_`|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = Array.from(plainText);
  return characters.length > 360 ? `${characters.slice(0, 360).join("")}…` : plainText;
}

function ResearchNoteBody({ note, expanded = true }: { note: string | null; expanded?: boolean }) {
  if (!note) return <p className="research-note-empty">분석 메모가 없습니다.</p>;
  if (!expanded) return <p className="research-note-preview">{researchNotePreview(note)}</p>;
  return <div className="research-note-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{note}</ReactMarkdown></div>;
}

function SecurityResearchNotes({ ticker }: { ticker: Ticker }) {
  const [research, setResearch] = useState<ResearchNotesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ symbol: ticker.code, market: ticker.market });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/game/research-notes?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { research?: ResearchNotesPage; error?: string };
      if (!response.ok || !payload.research) throw new Error(payload.error || "공개 분석 노트를 불러오지 못했습니다.");
      setResearch((current) => cursor && current ? { notes: [...current.notes, ...payload.research!.notes], nextCursor: payload.research!.nextCursor, total: payload.research!.total } : payload.research!);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "공개 분석 노트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [ticker.code, ticker.market]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleNotes = showAllNotes ? research?.notes : research?.notes.slice(0, 3);
  const toggleExpanded = (id: string) => setExpandedNoteIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <section className="security-research-notes" aria-label={`${ticker.name} 리그 분석 노트`}>
    <div className="research-section-heading"><div><span>LEAGUE RESEARCH</span><strong>{ticker.name} 분석 노트</strong></div><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "불러오는 중…" : "새로고침"}</button></div>
    <p className="research-disclaimer">리그 참가자가 공개한 개인 분석입니다. 투자 권유가 아닙니다.</p>
    {error ? <p className="research-note-error">{error}</p> : loading && !research ? <div className="league-inline-loading">공개 분석 노트를 불러오는 중…</div> : research?.notes.length ? <><div className="research-note-list">{visibleNotes?.map((note) => { const expanded = expandedNoteIds.has(note.id); return <article key={note.id} className="research-note-card"><header><div><strong>{note.nickname}{note.isMine ? " · 나" : ""}</strong><small>분석 기준일 {note.analysisDate} · 작성 {new Date(note.createdAt).toLocaleDateString("ko-KR")}</small></div><span>{note.assetType === "ETF" ? "ETF" : note.market}</span></header>{note.chartImageUrl && <a className="research-chart-image" href={note.chartImageUrl} target="_blank" rel="noreferrer"><img src={note.chartImageUrl} alt={`${note.securityName} 분석 차트`} /></a>}<ResearchNoteBody note={note.researchNote} expanded={expanded} />{note.researchNote && <button type="button" className="research-expand-button" aria-expanded={expanded} onClick={() => toggleExpanded(note.id)}>{expanded ? "접기" : "전문 보기"}</button>}</article>; })}</div>{research.total > 3 && <button type="button" className="research-list-toggle" onClick={() => setShowAllNotes((current) => !current)}>{showAllNotes ? "최근 3개만 보기" : `전체 분석 노트 ${research.total.toLocaleString("ko-KR")}개 보기`}</button>}</> : <p className="league-empty-copy">아직 공개된 분석 노트가 없습니다.</p>}
    {research?.nextCursor && <button type="button" className="research-load-more" disabled={loading} onClick={() => { const cursor = research.nextCursor; if (cursor) void load(cursor); }}>{loading ? "불러오는 중…" : "이전 분석 더 보기"}</button>}
  </section>;
}

type PriceChangeSummary = {
  current: number;
  previous: number;
  change: number;
  changePct: number;
};

type PriceChangePeriod = "daily" | "weekly" | "monthly";
type PriceChangeSet = Record<PriceChangePeriod, PriceChangeSummary | null>;
type ChartApiPayload = {
  points: ChartPoint[];
  changes?: PriceChangeSet;
  exchangeRate?: number;
  isNasdaq100?: boolean;
  classification?: SecurityClassification;
};
type ClassificationFilter = { kind: "market" | "sector" | "theme"; value: string };

const EMPTY_PRICE_CHANGES: PriceChangeSet = { daily: null, weekly: null, monthly: null };
const CHART_RANGE_MIN = 10;
const CHART_RANGE_MAX = 360;
const CHART_RANGE_STEP = 5;

type TrendLinePoint = { date: string; price: number };
type TrendLine = { id: string; start: TrendLinePoint; end: TrendLinePoint };
type ChartCanvasHandle = {
  copyImage: () => Promise<boolean>;
  captureImage: () => Promise<Blob | null>;
  undoTrendLine: () => void;
  clearTrendLines: () => void;
};
type ChartCanvasProps = {
  points: ChartPoint[];
  range: number;
  onRangeChange: (range: number) => void;
  trendLineMode: boolean;
  trendLineStorageKey: string;
  exportTitle: string;
};

function candidateKey(item: Pick<Candidate, "code" | "timeframe" | "maPeriod">) {
  return `${item.code}:${item.timeframe}:${item.maPeriod}`;
}

function compareCandidates(a: Candidate, b: Candidate) {
  return b.marketCap - a.marketCap || a.code.localeCompare(b.code) || a.timeframe.localeCompare(b.timeframe);
}

const ChartCanvas = forwardRef<ChartCanvasHandle, ChartCanvasProps>(function ChartCanvas({ points, range, onRangeChange, trendLineMode, trendLineStorageKey, exportTitle }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; start: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; range: number } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ y: number; price: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ y: number; price: number } | null>(null);
  // Store the viewport as a distance from the newest candle. An offset of zero
  // keeps the chart pinned to the latest data while its range changes.
  const [panOffset, setPanOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [draftTrendPoint, setDraftTrendPoint] = useState<TrendLinePoint | null>(null);
  const maxPanStart = Math.max(0, points.length - range);
  const safePanOffset = Math.min(panOffset, maxPanStart);
  const safePanStart = maxPanStart - safePanOffset;
  const visible = useMemo(() => points.slice(safePanStart, safePanStart + range), [points, safePanStart, range]);
  const focusedIndex = hoverIndex ?? selectedIndex;
  const focusedPoint = hoverPoint ?? selectedPoint;
  const active = focusedIndex === null ? visible.at(-1) : visible[focusedIndex];
  const candleDirection = active
    ? active.close > active.open
      ? "up"
      : active.close < active.open
        ? "down"
        : "flat"
    : "flat";
  const candleDirectionLabel = candleDirection === "up" ? "양봉" : candleDirection === "down" ? "음봉" : "보합";

  useEffect(() => {
    // A selected candle belongs to the previous data window and must not leak into the next readout.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(null);
    setSelectedPoint(null);
  }, [points, range]);

  useEffect(() => {
    // A newly opened security or timeframe should always start at the newest candle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanOffset(0);
  }, [points]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(trendLineStorageKey) ?? "[]") as TrendLine[];
      // A new ticker/timeframe has a separate saved drawing layer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrendLines(Array.isArray(parsed) ? parsed.filter((line) => line?.start?.date && line?.end?.date && Number.isFinite(line.start.price) && Number.isFinite(line.end.price)) : []);
    } catch {
      setTrendLines([]);
    }
    setDraftTrendPoint(null);
  }, [trendLineStorageKey]);

  const persistTrendLines = useCallback((next: TrendLine[]) => {
    setTrendLines(next);
    try { window.localStorage.setItem(trendLineStorageKey, JSON.stringify(next)); } catch { /* private-mode storage is optional */ }
  }, [trendLineStorageKey]);

  const addTrendPoint = useCallback((point: TrendLinePoint) => {
    if (!draftTrendPoint) {
      setDraftTrendPoint(point);
      return;
    }
    if (draftTrendPoint.date === point.date && Math.abs(draftTrendPoint.price - point.price) < 0.000001) return;
    persistTrendLines([...trendLines, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: draftTrendPoint, end: point }]);
    // Keep the latest point active so one drawing can continue as a connected path.
    // A double click (or leaving drawing mode) explicitly completes the path.
    setDraftTrendPoint(point);
  }, [draftTrendPoint, persistTrendLines, trendLines]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!trendLineMode) setDraftTrendPoint(null);
  }, [trendLineMode]);

  const captureImage = useCallback(async () => {
      const chartCanvas = canvasRef.current;
      if (!chartCanvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const padding = Math.round(18 * dpr);
      const headerHeight = Math.round(48 * dpr);
      const output = document.createElement("canvas");
      output.width = chartCanvas.width + padding * 2;
      output.height = chartCanvas.height + headerHeight + padding;
      const context = output.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, output.width, output.height);
      context.fillStyle = "#0f3229";
      context.font = `700 ${Math.round(15 * dpr)}px sans-serif`;
      context.fillText(exportTitle, padding, Math.round(25 * dpr));
      context.fillStyle = "#718079";
      context.font = `500 ${Math.round(10 * dpr)}px sans-serif`;
      context.fillText("LINE BREAKER · 이동평균 및 추세선", padding, Math.round(42 * dpr));
      context.drawImage(chartCanvas, padding, headerHeight);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
      return blob;
    }, [exportTitle]);

  useImperativeHandle(ref, () => ({
    captureImage,
    copyImage: async () => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
      const blob = await captureImage();
      if (!blob) return false;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    },
    undoTrendLine: () => {
      setDraftTrendPoint(null);
      persistTrendLines(trendLines.slice(0, -1));
    },
    clearTrendLines: () => {
      setDraftTrendPoint(null);
      persistTrendLines([]);
    },
  }), [captureImage, persistTrendLines, trendLines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible.length) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const left = 10;
      const right = 62;
      const top = 18;
      const priceBottom = height * 0.69;
      const volumeTop = height * 0.76;
      const volumeBottom = height - 26;
      const plotWidth = width - left - right;
      const highs = visible.map((point) => point.high);
      const lows = visible.map((point) => point.low);
      const maValues = visible.flatMap((point) =>
        [point.ma5, point.ma10, point.ma240].filter((value): value is number => value !== null),
      );
      const minPrice = Math.min(...lows, ...maValues) * 0.985;
      const maxPrice = Math.max(...highs, ...maValues) * 1.015;
      const maxVolume = Math.max(...visible.map((point) => point.volume), 1);
      const xStep = plotWidth / Math.max(visible.length, 1);
      // Keep each bar visually substantial when the view is zoomed in, while
      // preserving a small gap so adjacent candles remain distinguishable.
      // The same width is used for volume to keep price/volume aligned.
      const candleWidth = Math.max(4, Math.min(56, xStep * 0.82));
      const x = (index: number) => left + xStep * (index + 0.5);
      const y = (price: number) =>
        top + ((maxPrice - price) / Math.max(maxPrice - minPrice, 1)) * (priceBottom - top);
      const rootStyles = getComputedStyle(document.documentElement);
      const candleUpColor = rootStyles.getPropertyValue("--candle-up").trim() || "#d95842";
      const candleDownColor = rootStyles.getPropertyValue("--candle-down").trim() || "#2f6fd6";
      const candleFlatColor = rootStyles.getPropertyValue("--candle-flat").trim() || "#7b8580";
      const ma5Color = rootStyles.getPropertyValue("--ma5").trim() || "#32965b";
      const ma10Color = rootStyles.getPropertyValue("--ma10").trim() || "#cc4651";
      const ma240Color = rootStyles.getPropertyValue("--ma240").trim() || "#18211e";

      ctx.font = "11px var(--font-geist-mono), monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let line = 0; line < 5; line += 1) {
        const ratio = line / 4;
        const lineY = top + ratio * (priceBottom - top);
        const price = maxPrice - ratio * (maxPrice - minPrice);
        ctx.strokeStyle = "rgba(42, 54, 65, 0.09)";
      ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(left, lineY);
        ctx.lineTo(width - right + 6, lineY);
        ctx.stroke();
        ctx.fillStyle = "#7d877f";
        ctx.fillText(number.format(Math.round(price)), width - right + 10, lineY);
      }

      visible.forEach((point, index) => {
        const color =
          point.close > point.open
            ? candleUpColor
            : point.close < point.open
              ? candleDownColor
              : candleFlatColor;
        const center = x(index);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center, y(point.high));
        ctx.lineTo(center, y(point.low));
        ctx.stroke();
        const bodyTop = y(Math.max(point.open, point.close));
        const bodyBottom = y(Math.min(point.open, point.close));
        ctx.fillStyle = color;
        ctx.fillRect(center - candleWidth / 2, bodyTop, candleWidth, Math.max(1.5, bodyBottom - bodyTop));

        const volumeHeight = (point.volume / maxVolume) * (volumeBottom - volumeTop);
        ctx.globalAlpha = 0.42;
        ctx.fillRect(center - candleWidth / 2, volumeBottom - volumeHeight, candleWidth, volumeHeight);
        ctx.globalAlpha = 1;
      });

      const drawMovingAverage = (
        key: "ma5" | "ma10" | "ma240",
        color: string,
        lineWidth: number,
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        let started = false;
        visible.forEach((point, index) => {
          const value = point[key];
          if (value === null) return;
          if (!started) {
            ctx.moveTo(x(index), y(value));
            started = true;
          } else {
            ctx.lineTo(x(index), y(value));
          }
        });
        if (started) ctx.stroke();
      };

      drawMovingAverage("ma5", ma5Color, 1.5);
      drawMovingAverage("ma10", ma10Color, 2.2);
      drawMovingAverage("ma240", ma240Color, 2.3);

      const trendPointPosition = (point: TrendLinePoint) => {
        const index = visible.findIndex((candle) => candle.date === point.date);
        return index < 0 ? null : { x: x(index), y: y(point.price) };
      };
      const drawTrendPoint = (point: TrendLinePoint, color: string) => {
        const position = trendPointPosition(point);
        if (!position) return;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(position.x, position.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
      trendLines.forEach((line) => {
        const start = trendPointPosition(line.start);
        const end = trendPointPosition(line.end);
        if (!start || !end) return;
        ctx.strokeStyle = "#8a56d6";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      });
      if (draftTrendPoint) drawTrendPoint(draftTrendPoint, "#c47b12");

      const labelIndexes = [0, Math.floor((visible.length - 1) / 2), visible.length - 1];
      ctx.fillStyle = "#8a928d";
      ctx.textAlign = "center";
      labelIndexes.forEach((index) => {
        if (index >= 0 && visible[index]) ctx.fillText(visible[index].date.slice(2), x(index), height - 10);
      });

      if (focusedIndex !== null && visible[focusedIndex]) {
        const center = x(focusedIndex);
        ctx.strokeStyle = "rgba(27, 69, 58, 0.32)";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(center, top);
        ctx.lineTo(center, volumeBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (focusedPoint) {
        const hoverY = Math.max(top, Math.min(priceBottom, focusedPoint.y));
        ctx.strokeStyle = "rgba(27, 69, 58, 0.3)";
        ctx.lineWidth = 0.7;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(left, hoverY);
        ctx.lineTo(width - right + 6, hoverY);
        ctx.stroke();
        ctx.setLineDash([]);
        const label = number.format(Math.round(focusedPoint.price));
        const labelWidth = Math.max(48, ctx.measureText(label).width + 14);
        ctx.fillStyle = "rgba(27, 69, 58, 0.94)";
        ctx.fillRect(width - labelWidth - 4, hoverY - 10, labelWidth, 20);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "right";
        ctx.font = "600 10px var(--font-geist-mono), monospace";
        ctx.fillText(label, width - 10, hoverY);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible, focusedIndex, focusedPoint, trendLines, draftTrendPoint]);

  return (
    <div className="chart-wrap">
      <canvas
        ref={canvasRef}
        className={`chart-canvas${dragging ? " is-dragging" : ""}${trendLineMode ? " is-drawing-trendline" : ""}`}
        role="img"
        aria-label="선택 종목의 캔들, 이동평균선과 거래량 차트"
        onPointerLeave={(event) => {
          if (!dragRef.current) {
            setHoverIndex(null);
            setHoverPoint(null);
            if (event.pointerType !== "touch") return;
          }
        }}
        onPointerDown={(event) => {
          if (trendLineMode) {
            event.preventDefault();
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pointers = [...pointersRef.current.values()];
          if (pointers.length >= 2) {
            pinchRef.current = {
              distance: Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y),
              range,
            };
            dragRef.current = null;
          } else {
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: safePanStart };
          }
          setDragging(true);
          setHoverIndex(null);
          setHoverPoint(null);
        }}
        onPointerUp={(event) => {
          if (trendLineMode) {
            const rect = event.currentTarget.getBoundingClientRect();
            const left = 10;
            const right = 62;
            const top = 18;
            const priceBottom = rect.height * 0.69;
            const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left - left) / (rect.width - left - right)));
            const index = Math.min(visible.length - 1, Math.floor(ratio * visible.length));
            const highs = visible.map((point) => point.high);
            const lows = visible.map((point) => point.low);
            const maValues = visible.flatMap((point) => [point.ma5, point.ma10, point.ma240].filter((value): value is number => value !== null));
            const minPrice = Math.min(...lows, ...maValues) * 0.985;
            const maxPrice = Math.max(...highs, ...maValues) * 1.015;
            const pointerY = Math.max(top, Math.min(priceBottom, event.clientY - rect.top));
            const price = maxPrice - ((pointerY - top) / Math.max(priceBottom - top, 1)) * (maxPrice - minPrice);
            if (visible[index]) addTrendPoint({ date: visible[index].date, price });
            return;
          }
          const dragStart = dragRef.current;
          const wasPinching = pinchRef.current !== null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          pointersRef.current.delete(event.pointerId);
          dragRef.current = null;
          const remainingPointers = [...pointersRef.current.entries()];
          if (remainingPointers.length === 1) {
            const [pointerId, pointer] = remainingPointers[0];
            pinchRef.current = null;
            dragRef.current = { pointerId, x: pointer.x, y: pointer.y, start: safePanStart };
          } else if (!remainingPointers.length) {
            pinchRef.current = null;
            setDragging(false);
          }
          if (!wasPinching && dragStart?.pointerId === event.pointerId && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 8) {
            const rect = event.currentTarget.getBoundingClientRect();
            const left = 10;
            const right = 62;
            const top = 18;
            const priceBottom = rect.height * 0.69;
            const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left - left) / (rect.width - left - right)));
            const index = Math.min(visible.length - 1, Math.floor(ratio * visible.length));
            const highs = visible.map((point) => point.high);
            const lows = visible.map((point) => point.low);
            const maValues = visible.flatMap((point) =>
              [point.ma5, point.ma10, point.ma240].filter((value): value is number => value !== null),
            );
            const minPrice = Math.min(...lows, ...maValues) * 0.985;
            const maxPrice = Math.max(...highs, ...maValues) * 1.015;
            const y = Math.max(top, Math.min(priceBottom, event.clientY - rect.top));
            const price = maxPrice - ((y - top) / Math.max(priceBottom - top, 1)) * (maxPrice - minPrice);
            setSelectedIndex(index);
            setSelectedPoint({ y, price });
          }
        }}
        onPointerCancel={(event) => {
          pointersRef.current.delete(event.pointerId);
          pinchRef.current = null;
          dragRef.current = null;
          setDragging(false);
        }}
        onPointerMove={(event) => {
          if (trendLineMode) return;
          pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const rect = event.currentTarget.getBoundingClientRect();
          const left = 10;
          const right = 62;
          const top = 18;
          const priceBottom = rect.height * 0.69;
          const pointers = [...pointersRef.current.values()];
          if (pointers.length >= 2 && pinchRef.current) {
            const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
            if (distance > 0) {
              const rawRange = pinchRef.current.range * (pinchRef.current.distance / distance);
              const nextRange = Math.max(
                CHART_RANGE_MIN,
                Math.min(CHART_RANGE_MAX, Math.round(rawRange / CHART_RANGE_STEP) * CHART_RANGE_STEP),
              );
              onRangeChange(nextRange);
            }
            return;
          }
          if (dragRef.current) {
            const plotWidth = rect.width - left - right;
      const xStep = plotWidth / Math.max(visible.length, 1);
            const deltaBars = Math.round((event.clientX - dragRef.current.x) / Math.max(xStep, 1));
            const nextPanStart = Math.max(0, Math.min(maxPanStart, dragRef.current.start - deltaBars));
            setPanOffset(maxPanStart - nextPanStart);
            return;
          }
          const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left - left) / (rect.width - left - right)));
          setHoverIndex(Math.min(visible.length - 1, Math.floor(ratio * visible.length)));
          const highs = visible.map((point) => point.high);
          const lows = visible.map((point) => point.low);
          const maValues = visible.flatMap((point) =>
            [point.ma5, point.ma10, point.ma240].filter((value): value is number => value !== null),
          );
          const minPrice = Math.min(...lows, ...maValues) * 0.985;
          const maxPrice = Math.max(...highs, ...maValues) * 1.015;
          const y = Math.max(top, Math.min(priceBottom, event.clientY - rect.top));
          const price = maxPrice - ((y - top) / Math.max(priceBottom - top, 1)) * (maxPrice - minPrice);
          setHoverPoint({ y, price });
        }}
        onDoubleClick={(event) => {
          if (!trendLineMode) return;
          event.preventDefault();
          setDraftTrendPoint(null);
        }}
      />
      {active && (
        <div
          className="chart-readout"
          data-candle-direction={candleDirection}
          aria-label={`${active.date} ${candleDirectionLabel} 시세 정보`}
          aria-live="polite"
        >
          <span className="readout-date">
            <time>{active.date}</time>
            <small className="readout-direction" aria-label={candleDirectionLabel} title={candleDirectionLabel} />
          </span>
          <span className="readout-stat readout-open"><em>시가</em><b>{formatPrice(active.open)}</b></span>
          <span className="readout-stat readout-high"><em>고가</em><b>{formatPrice(active.high)}</b></span>
          <span className="readout-stat readout-low"><em>저가</em><b>{formatPrice(active.low)}</b></span>
          <span className="readout-stat readout-close"><em>종가</em><b>{formatPrice(active.close)}</b></span>
          <span className="readout-stat readout-ma5"><em>MA5</em><b>{active.ma5 === null ? "-" : formatPrice(active.ma5)}</b></span>
          <span className="readout-stat readout-ma10"><em>MA10</em><b>{active.ma10 === null ? "-" : formatPrice(active.ma10)}</b></span>
          <span className="readout-stat readout-ma240"><em>MA240</em><b>{active.ma240 === null ? "-" : formatPrice(active.ma240)}</b></span>
          <span className="readout-stat readout-volume"><em>거래량</em><b>{formatVolume(active.volume)}</b></span>
        </div>
      )}
    </div>
  );
});

type AuthStatus =
  | { phase: "loading" }
  | { phase: "signed-out"; configured: boolean; error?: string }
  | { phase: "access-pending"; user: AuthUser; status: "pending" | "rejected" }
  | { phase: "signed-in"; user: AuthUser };

function LoginGate({ status }: { status: Exclude<AuthStatus, { phase: "signed-in" }> }) {
  const isLoading = status.phase === "loading";
  const configured = status.phase === "signed-out" && status.configured;
  const oauthError = status.phase === "signed-out" ? status.error : undefined;
  return (
    <main className="login-shell">
      <section className="login-card" aria-busy={isLoading}>
        <img className="login-logo" src="/brand-mark.png" alt="선 넘네.." />
        <p className="login-eyebrow">KOREA &amp; U.S. MARKETS</p>
        <h1>LINE BREAKER</h1>
        <p className="login-description">한·미 주식의 MA10·MA240 돌파 신호를 확인하세요.</p>
        {isLoading ? (
          <div className="auth-loading"><span />로그인 상태 확인 중</div>
        ) : configured ? (
          <a className="google-login-button" href="/api/auth/google/start">
            <span className="google-g" aria-hidden="true">G</span>
            Google로 계속하기
          </a>
        ) : (
          <div className="auth-config-message">
            <strong>Google 로그인을 준비하고 있습니다.</strong>
            <span>OAuth 환경변수 설정 후 이용할 수 있습니다.</span>
          </div>
        )}
        {oauthError && oauthError !== "config" && (
          <p className="auth-error">로그인을 완료하지 못했습니다. 다시 시도해 주세요.</p>
        )}
        <small className="login-privacy">로그인 정보는 서비스 인증에만 사용됩니다.</small>
      </section>
    </main>
  );
}

function AccessPendingGate({ status }: { status: Extract<AuthStatus, { phase: "access-pending" }> }) {
  const rejected = status.status === "rejected";
  return <main className="login-shell"><section className="login-card access-pending-card">
    <img className="login-logo" src="/brand-mark.png" alt="선 넘네.." />
    <p className="login-eyebrow">ACCESS REQUEST</p>
    <h1>{rejected ? "접근 요청이 보류되었습니다" : "접근 승인 대기 중"}</h1>
    <p className="login-description">{rejected ? "운영자에게 문의해 주세요." : "운영자가 승인하면 이 화면을 새로고침해 바로 이용할 수 있습니다."}</p>
    <div className="access-pending-user"><strong>{status.user.name}</strong><span>{status.user.email}</span></div>
    {!rejected && <button type="button" className="google-login-button" onClick={() => window.location.reload()}>승인 상태 다시 확인</button>}
    <a className="access-logout" href="/api/auth/logout">다른 계정으로 로그인</a>
  </section></main>;
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const error = new URLSearchParams(window.location.search).get("auth_error") ?? undefined;
    fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("인증 상태를 확인하지 못했습니다.");
        return response.json() as Promise<{ authenticated: boolean; configured: boolean; accessStatus?: "pending" | "approved" | "rejected"; user: AuthUser | null }>;
      })
      .then((payload) => {
        if (payload.authenticated && payload.user) setAuthStatus({ phase: "signed-in", user: payload.user });
        else if (payload.user && (payload.accessStatus === "pending" || payload.accessStatus === "rejected")) setAuthStatus({ phase: "access-pending", user: payload.user, status: payload.accessStatus });
        else setAuthStatus({ phase: "signed-out", configured: payload.configured, error });
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name !== "AbortError") {
          setAuthStatus({ phase: "signed-out", configured: false, error: "session" });
        }
      });
    return () => controller.abort();
  }, []);

  if (authStatus.phase === "access-pending") return <AccessPendingGate status={authStatus} />;
  if (authStatus.phase !== "signed-in") return <LoginGate status={authStatus} />;
  return <Dashboard authUser={authStatus.user} />;
}

function FavoriteDialog({
  currentTicker,
  initialLists,
  onClose,
  onOpenChart,
  onListsChange,
}: {
  currentTicker: Ticker | null;
  initialLists: FavoriteList[] | null;
  onClose: () => void;
  onOpenChart: (ticker: Ticker) => void;
  onListsChange: (lists: FavoriteList[]) => void;
}) {
  const [lists, setLists] = useState<FavoriteList[]>(initialLists ?? []);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [loading, setLoading] = useState(initialLists === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedList = lists.find((list) => list.id === selectedListId) ?? lists[0] ?? null;
  const currentSaved = Boolean(currentTicker && selectedList?.items.some((item) => item.symbol === currentTicker.code && item.market === currentTicker.market));

  const applyLists = useCallback((nextLists: FavoriteList[]) => {
    setLists(nextLists);
    onListsChange(nextLists);
    setSelectedListId((current) => nextLists.some((list) => list.id === current) ? current : nextLists[0]?.id ?? "");
  }, [onListsChange]);

  useEffect(() => {
    const controller = new AbortController();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    if (initialLists !== null) {
      return () => {
        controller.abort();
        cancelAnimationFrame(focusFrame);
        document.removeEventListener("keydown", closeOnEscape);
        document.body.style.overflow = "";
      };
    }
    fetch("/api/favorites", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { lists?: FavoriteList[]; error?: string };
        if (!response.ok || !payload.lists) throw new Error(payload.error || "즐겨찾기를 불러오지 못했습니다.");
        applyLists(payload.lists);
      })
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [applyLists, initialLists, onClose]);

  async function mutate(input: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json() as { lists?: FavoriteList[]; error?: string };
      if (!response.ok || !payload.lists) throw new Error(payload.error || "즐겨찾기를 저장하지 못했습니다.");
      applyLists(payload.lists);
      return payload.lists;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "즐겨찾기를 저장하지 못했습니다.");
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  async function createList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newListName.trim()) return;
    try {
      const createdName = newListName.normalize("NFKC").trim().replace(/\s+/gu, " ");
      const nextLists = await mutate({ action: "create_list", name: newListName });
      const createdList = nextLists.find((list) => list.name === createdName);
      if (createdList) setSelectedListId(createdList.id);
      setNewListName("");
    } catch { /* Error is displayed in the dialog. */ }
  }

  return (
    <div className="favorite-dialog-backdrop" role="presentation">
      <section className="favorite-dialog" role="dialog" aria-modal="true" aria-labelledby="favorite-dialog-title">
        <button ref={closeButtonRef} className="favorite-dialog-close" type="button" onClick={onClose} aria-label="즐겨찾기 닫기">×</button>
        <header className="favorite-dialog-heading">
          <span aria-hidden="true">★</span>
          <div><p>MY WATCHLISTS</p><h2 id="favorite-dialog-title">즐겨찾기</h2></div>
        </header>

        {loading ? <div className="favorite-loading">즐겨찾기를 불러오는 중…</div> : (
          <>
            <form className="favorite-create-form" onSubmit={createList}>
              <input value={newListName} onChange={(event) => setNewListName(event.target.value)} maxLength={20} placeholder="새 목록 이름" aria-label="새 즐겨찾기 목록 이름" />
              <button type="submit" disabled={saving || !newListName.trim()}>목록 만들기</button>
            </form>

            <div className="favorite-list-tabs" role="tablist" aria-label="즐겨찾기 목록">
              {lists.map((list) => <button type="button" role="tab" aria-selected={selectedList?.id === list.id} className={selectedList?.id === list.id ? "active" : ""} key={list.id} onClick={() => { setSelectedListId(list.id); setRenaming(false); }}>{list.name}<small>{list.items.length}</small></button>)}
            </div>

            {selectedList && <>
              <div className="favorite-list-heading">
                {renaming ? (
                  <form onSubmit={(event) => { event.preventDefault(); void mutate({ action: "rename_list", listId: selectedList.id, name: renameValue }).then(() => setRenaming(false)).catch(() => undefined); }}>
                    <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={20} aria-label="즐겨찾기 목록 새 이름" />
                    <button type="submit" disabled={saving || !renameValue.trim()}>저장</button>
                    <button type="button" onClick={() => setRenaming(false)}>취소</button>
                  </form>
                ) : <div><strong>{selectedList.name}</strong><small>{selectedList.items.length}종목</small></div>}
                {!renaming && <div className="favorite-list-actions"><button type="button" onClick={() => { setRenameValue(selectedList.name); setRenaming(true); }}>이름 변경</button><button type="button" className="danger" disabled={lists.length <= 1 || saving} onClick={() => { if (window.confirm(`‘${selectedList.name}’ 목록을 삭제할까요?`)) void mutate({ action: "delete_list", listId: selectedList.id }).catch(() => undefined); }}>목록 삭제</button></div>}
              </div>

              {currentTicker && currentTicker.code !== "MARKET" && (
                <button type="button" className={`favorite-add-current${currentSaved ? " saved" : ""}`} disabled={saving || currentSaved} onClick={() => void mutate({ action: "add_item", listId: selectedList.id, symbol: currentTicker.code, securityName: currentTicker.name, market: currentTicker.market, assetType: currentTicker.assetType }).catch(() => undefined)}>
                  <span>{currentSaved ? "✓" : "+"}</span><div><strong>{currentTicker.name}</strong><small>{currentTicker.code} · {currentTicker.market}</small></div><em>{currentSaved ? "저장됨" : "현재 종목 추가"}</em>
                </button>
              )}

              <div className="favorite-items">
                {selectedList.items.map((item) => (
                  <article key={item.id}>
                    <button type="button" className="favorite-item-open" onClick={() => onOpenChart({ code: item.symbol, name: item.securityName, market: item.market, assetType: item.assetType, marketCap: 0, price: 0, currency: item.nativeCurrency })}>
                      <strong>{item.securityName}</strong><small>{item.symbol} · {item.market} · {item.assetType === "STOCK" ? "주식" : item.assetType}</small>
                    </button>
                    <button type="button" className="favorite-item-remove" disabled={saving} onClick={() => void mutate({ action: "remove_item", listId: selectedList.id, itemId: item.id }).catch(() => undefined)} aria-label={`${item.securityName} 즐겨찾기에서 삭제`}>×</button>
                  </article>
                ))}
                {!selectedList.items.length && <p>아직 저장한 종목이 없습니다.<br />차트에서 관심 종목을 추가해 보세요.</p>}
              </div>
            </>}
          </>
        )}
        {error && <p className="favorite-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function analysisOpinionLabel(opinion: StockDeepAnalysis["opinion"]) {
  return opinion === "STRONG_BUY" ? "적극 매수" : opinion === "BUY" ? "매수" : opinion === "HOLD" ? "관망" : "매도";
}

function analysisPrice(value: number | null, currency: "KRW" | "USD") {
  if (value === null) return "확인되지 않음";
  return currency === "USD" ? formatUsd(value) : `${formatPrice(value)}원`;
}

function analysisMetric(value: number, unit: string) {
  if (unit === "%" || unit === "배") return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`;
  if (unit === "USD") return formatUsd(value);
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`;
}

function signedQuantity(value: number | null) {
  if (value === null) return "미확인";
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("ko-KR")}주`;
}

function holdingReturnPct(holding: { averageCostKrw: string; quantity: number; unrealizedPnlKrw: string }) {
  const costKrw = Number(holding.averageCostKrw) * holding.quantity;
  const pnlKrw = Number(holding.unrealizedPnlKrw);
  if (!Number.isFinite(costKrw) || costKrw <= 0 || !Number.isFinite(pnlKrw)) return null;
  return (pnlKrw / costKrw) * 100;
}

function StockAnalysisDialog({ ticker, onClose }: { ticker: Ticker; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<StockDeepAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeHandlerRef = useRef(onClose);
  const analysisRequestRef = useRef(0);

  useEffect(() => {
    closeHandlerRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const progressTimer = window.setInterval(() => setLoadingStep((step) => Math.min(step + 1, 2)), 4_500);
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeHandlerRef.current(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    fetch("/api/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: ticker.code, market: ticker.market }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as { analysis?: StockDeepAnalysis; error?: string };
        if (!response.ok || !payload.analysis) throw new Error(payload.error || "AI 심층분석을 불러오지 못했습니다.");
        if (controller.signal.aborted || analysisRequestRef.current !== requestId) return;
        setAnalysis(payload.analysis);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted && analysisRequestRef.current === requestId && loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => { if (!controller.signal.aborted && analysisRequestRef.current === requestId) setLoading(false); });
    return () => {
      controller.abort();
      cancelAnimationFrame(focusFrame);
      window.clearInterval(progressTimer);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [ticker.code, ticker.market]);

  return (
    <div className="analysis-dialog-backdrop" role="presentation">
      <section className="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-dialog-title">
        <button ref={closeButtonRef} className="analysis-dialog-close" type="button" onClick={onClose} aria-label="AI 심층분석 닫기">×</button>
        <header className="analysis-dialog-heading">
          <span aria-hidden="true">AI</span>
          <div><p>DATA-DRIVEN STOCK RESEARCH</p><h2 id="analysis-dialog-title">{ticker.name} AI 심층분석</h2><small>{ticker.code} · {ticker.market} · {analysis?.security.marketCap ? `시가총액 ${formatCap(analysis.security.marketCap)}` : "최신 공개정보 기준"}</small></div>
        </header>

        {loading ? (
          <div className="analysis-loading"><span /><strong>{["공시·IR·차트 근거를 수집하고 있습니다.", "강세 논지와 반대 논지를 독립적으로 검토하고 있습니다.", "수석 애널리스트가 근거를 교차 검증해 보고서를 작성하고 있습니다."][loadingStep]}</strong><small>리서치 수집가 · 반대 논지 검토자 · 최종 편집자가 순서대로 작동합니다.</small></div>
        ) : error ? (
          <div className="analysis-error" role="alert"><strong>분석을 완료하지 못했습니다.</strong><p>{error}</p><button type="button" onClick={onClose}>닫기</button></div>
        ) : analysis && (
          <div className="analysis-content">
            <section className="analysis-verdict">
              <div><span className={`analysis-opinion ${analysis.opinion.toLowerCase()}`}>{analysisOpinionLabel(analysis.opinion)}</span><small>분석 신뢰도 {Math.round(analysis.confidence)}%</small></div>
              <h3>{analysis.oneLineConclusion}</h3>
              <p>{new Date(analysis.generatedAt).toLocaleString("ko-KR")} 생성{analysis.cached ? " · 캐시된 분석" : ""}</p>
            </section>

            <section className="analysis-quality" aria-label="분석 근거 품질">
              <div><span>RESEARCH QUALITY</span><strong>근거 품질 {analysis.quality.score}점</strong></div>
              <p>근거 카드 {analysis.quality.evidenceCount}개 · 1차 공시 {analysis.quality.primaryEvidenceCount}개 · 섹션 출처 연결 {analysis.quality.citationCoveragePct}%</p>
              {analysis.quality.issues.length > 0 && <small>{analysis.quality.issues.join(" ")}</small>}
            </section>

            <div className="analysis-price-grid">
              <article><span>적정 진입가</span><strong>{analysisPrice(analysis.prices.entry, analysis.prices.currency)}</strong></article>
              <article><span>12개월 목표가</span><strong>{analysisPrice(analysis.prices.target, analysis.prices.currency)}</strong></article>
              <article><span>손절 기준가</span><strong>{analysisPrice(analysis.prices.stop, analysis.prices.currency)}</strong></article>
            </div>
            <p className="analysis-price-method"><strong>산정 기준</strong>{analysis.prices.method}</p>

            {analysis.fundamentals && (
              <section className="analysis-fundamentals">
                <div><span>VERIFIED FUNDAMENTALS</span><strong>확인된 재무·밸류에이션</strong><small>{analysis.fundamentals.period}{analysis.fundamentals.asOf ? ` · 기준 ${analysis.fundamentals.asOf}` : ""}</small></div>
                <dl>{analysis.fundamentals.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{analysisMetric(metric.value, metric.unit)}</dd></div>)}</dl>
                <a href={analysis.fundamentals.source.url} target="_blank" rel="noreferrer">출처: {analysis.fundamentals.source.title} ↗</a>
              </section>
            )}

            {analysis.marketIntelligence && (
              <section className="analysis-market-intelligence">
                <div><span>VERIFIED MARKET INTELLIGENCE</span><strong>수급 · 컨센서스 · 리서치 · 최근 뉴스</strong><small>{analysis.marketIntelligence.asOf ? `기준 ${analysis.marketIntelligence.asOf}` : "최근 공개 정보 기준"}</small></div>
                {analysis.marketIntelligence.investor && <div className="analysis-intelligence-grid">
                  <article><span>외국인 5일 순매수</span><strong className={analysis.marketIntelligence.investor.foreignFiveDay !== null && analysis.marketIntelligence.investor.foreignFiveDay < 0 ? "negative" : "positive"}>{signedQuantity(analysis.marketIntelligence.investor.foreignFiveDay)}</strong><small>{analysis.marketIntelligence.investor.foreignBuyDays}/5일 순매수 · 보유 {analysis.marketIntelligence.investor.foreignHoldingPct?.toFixed(2) ?? "-"}%</small></article>
                  <article><span>기관 5일 순매수</span><strong className={analysis.marketIntelligence.investor.institutionFiveDay !== null && analysis.marketIntelligence.investor.institutionFiveDay < 0 ? "negative" : "positive"}>{signedQuantity(analysis.marketIntelligence.investor.institutionFiveDay)}</strong><small>{analysis.marketIntelligence.investor.institutionBuyDays}/5일 순매수</small></article>
                </div>}
                {analysis.marketIntelligence.consensus && <p className="analysis-consensus">컨센서스 의견 <strong>{analysis.marketIntelligence.consensus.rating?.toFixed(2) ?? "미확인"}</strong> · 목표가 <strong>{analysis.marketIntelligence.consensus.targetPrice ? `${formatPrice(analysis.marketIntelligence.consensus.targetPrice)}원` : "미확인"}</strong>{analysis.marketIntelligence.consensus.asOf ? ` · ${analysis.marketIntelligence.consensus.asOf}` : ""}</p>}
                {analysis.marketIntelligence.researches.length > 0 && <ul className="analysis-researches">{analysis.marketIntelligence.researches.map((research) => <li key={`${research.broker}:${research.title}`}><strong>{research.broker}</strong><span>{research.title}</span><small>{research.date ?? ""}</small></li>)}</ul>}
                {analysis.marketIntelligence.recentNews.length > 0 && <div className="analysis-news"><strong>최근 종목 뉴스</strong><small>뉴스는 공시·회사 IR과 교차 확인 전까지 보조 근거로만 사용합니다.</small><ul>{analysis.marketIntelligence.recentNews.slice(0, 5).map((news) => <li key={news.id}><span className={news.directMention ? "direct" : "context"}>{news.directMention ? "직접 언급" : "시장 맥락"}</span><a href={news.url} target="_blank" rel="noreferrer">{news.title}</a><small>{news.office} · {news.publishedAt ?? "시각 미확인"}</small></li>)}</ul></div>}
                <a href={analysis.marketIntelligence.source.url} target="_blank" rel="noreferrer">출처: {analysis.marketIntelligence.source.title} ↗</a>
              </section>
            )}

            <div className="analysis-sections">
              {analysis.sections.map((section, index) => (
                <details key={section.id} open={index < 2}>
                  <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{section.title.replace(/^\d+\.\s*/u, "")}</strong><em>＋</em></summary>
                  <div>
                    <p>{section.summary}</p>
                    <ul>{section.bullets.map((bullet, bulletIndex) => <li key={`${section.id}-${bulletIndex}`}>{bullet}</li>)}</ul>
                    {section.sourceIds.length > 0 && <small>근거: {section.sourceIds.join(" · ")}</small>}
                  </div>
                </details>
              ))}
            </div>

            <section className="analysis-scenarios">
              <div><span>SCENARIO MAP</span><strong>세 가지 가능성</strong></div>
              <div>{analysis.scenarios.map((scenario) => <article key={scenario.name}><header><strong>{scenario.name}</strong><span>{Math.round(scenario.probabilityPct)}%</span></header><p>{scenario.rationale}</p><small>목표 {analysisPrice(scenario.targetPrice, analysis.prices.currency)} · 손절 {analysisPrice(scenario.stopPrice, analysis.prices.currency)}</small></article>)}</div>
            </section>

            {analysis.missingData.length > 0 && <section className="analysis-missing"><strong>확인되지 않은 정보</strong><ul>{analysis.missingData.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}

            <details className="analysis-evidence">
              <summary><span>FACT LEDGER</span><strong>확인된 근거 카드 {analysis.evidence.length}개</strong><em>＋</em></summary>
              <ul>{analysis.evidence.map((card) => <li key={card.id}><span>{card.id}</span><div><strong>{card.claim}</strong><p>{card.value}</p><small>{card.period ?? "기간 미확인"}{card.asOf ? ` · ${card.asOf}` : ""} · {card.sourceTier === "primary" ? "1차 공시" : card.sourceTier === "derived" ? "차트 계산" : "시장 데이터"}</small></div><a href={card.sourceUrl} target="_blank" rel="noreferrer">{card.sourceId} ↗</a></li>)}</ul>
            </details>

            <section className="analysis-sources">
              <div><span>SOURCES</span><strong>분석 근거</strong></div>
              <ol>{analysis.sources.map((source) => <li key={`${source.id}:${source.url}`}><span>{source.id}</span><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>{source.publishedAt && <small>{source.publishedAt}</small>}</li>)}</ol>
            </section>

            <footer className="analysis-disclaimer"><strong>AI 분석 안내</strong><p>{analysis.disclaimer}</p><small>모델: {analysis.model}</small></footer>
          </div>
        )}
      </section>
    </div>
  );
}

function LeagueDialog({
  onClose,
  onOpenChart,
  onCaptureChart,
  ticker,
}: {
  onClose: () => void;
  onOpenChart: (ticker: Ticker) => void;
  onCaptureChart: () => Promise<Blob | null>;
  ticker: Ticker | null;
}) {
  const [game, setGame] = useState<GameOverview | null>(null);
  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(null);
  const [league, setLeague] = useState<LeagueOverview | null>(null);
  const [research, setResearch] = useState<ResearchNotesPage | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PublicPlayerDetail | null>(null);
  const [admin, setAdmin] = useState<AdminGameOverview | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [accessRequestSavingId, setAccessRequestSavingId] = useState<string | null>(null);
  const [leagueTab, setLeagueTab] = useState<"portfolio" | "ranking" | "activity" | "research" | "admin">("portfolio");
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [activityFeedVisible, setActivityFeedVisible] = useState(true);
  const [tradeSide, setTradeSide] = useState<TradeSide>("buy");
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [quickBuyAllocation, setQuickBuyAllocation] = useState<QuickBuyAllocation | null>(null);
  const [tradeNote, setTradeNote] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [researchSearchResults, setResearchSearchResults] = useState<Ticker[]>([]);
  const [researchTicker, setResearchTicker] = useState<Ticker | null>(null);
  const [researchNoteDraft, setResearchNoteDraft] = useState("");
  const [researchChartImage, setResearchChartImage] = useState<Blob | null>(null);
  const [researchChartAttaching, setResearchChartAttaching] = useState(false);
  const [researchAnalysisDate, setResearchAnalysisDate] = useState(localDateInputValue);
  const [researchSaving, setResearchSaving] = useState(false);
  const [researchLoading, setResearchLoading] = useState(false);
  const [expandedResearchNoteIds, setExpandedResearchNoteIds] = useState<Set<string>>(() => new Set());
  const [researchVisibleCount, setResearchVisibleCount] = useState(RESEARCH_FEED_INITIAL_COUNT);
  const [tradeConfirming, setTradeConfirming] = useState(false);
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);
  const [adminDraft, setAdminDraft] = useState({ name: "", slug: "", startsAt: "", endsAt: "", initialCashKrw: "100000000", status: "draft" });
  const [analysisModelDraft, setAnalysisModelDraft] = useState("");
  const [analysisModelSaving, setAnalysisModelSaving] = useState(false);
  const [error, setError] = useState("");
  const [leagueNotice, setLeagueNotice] = useState("");
  const [leagueRefreshRemaining, setLeagueRefreshRemaining] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadPortfolio = useCallback(async (signal?: AbortSignal) => {
    setPortfolioLoading(true);
    try {
      const response = await fetch("/api/game/portfolio", { signal, cache: "no-store" });
      const payload = (await response.json()) as { dashboard?: PortfolioDashboard; error?: string };
      if (!response.ok || !payload.dashboard) {
        throw new Error(payload.error || "내 투자 정보를 불러오지 못했습니다.");
      }
      setDashboard(payload.dashboard);
    } finally {
      if (!signal?.aborted) setPortfolioLoading(false);
    }
  }, []);

  const loadLeague = useCallback(async (refresh = false, signal?: AbortSignal) => {
    setLeagueLoading(true);
    try {
      const response = await fetch("/api/game/leaderboard", {
        method: refresh ? "POST" : "GET",
        signal,
        cache: "no-store",
      });
      const payload = (await response.json()) as { league?: LeagueOverview; error?: string };
      if (response.status === 429) {
        const retryAfter = Math.max(1, Number(response.headers.get("retry-after")) || 1);
        setLeagueRefreshRemaining(retryAfter);
      } else if (refresh && response.ok) {
        setLeagueRefreshRemaining(0);
      }
      if (!response.ok || !payload.league) throw new Error(payload.error || "리그 순위를 불러오지 못했습니다.");
      setLeague(payload.league);
      setSelectedPlayer(null);
    } finally {
      if (!signal?.aborted) setLeagueLoading(false);
    }
  }, []);

  const loadResearch = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    setResearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/game/research-notes${params.size ? `?${params.toString()}` : ""}`, { signal, cache: "no-store" });
      const payload = await response.json() as { research?: ResearchNotesPage; error?: string };
      if (!response.ok || !payload.research) throw new Error(payload.error || "분석 노트를 불러오지 못했습니다.");
      setResearch((current) => cursor && current ? { notes: [...current.notes, ...payload.research!.notes], nextCursor: payload.research!.nextCursor, total: payload.research!.total } : payload.research!);
    } finally {
      if (!signal?.aborted) setResearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const query = researchQuery.trim();
    if (query.length < 1) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?query=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as { tickers?: Ticker[] };
          if (response.ok) setResearchSearchResults((payload.tickers ?? []).filter((item) => item.assetType === "STOCK" || item.assetType === "ETF"));
        })
        .catch((searchError) => { if (searchError instanceof Error && searchError.name !== "AbortError") setResearchSearchResults([]); });
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [researchQuery]);

  useEffect(() => {
    if (leagueRefreshRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setLeagueRefreshRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [leagueRefreshRemaining]);

  const loadPlayer = useCallback(async (profileId: string) => {
    setLeagueLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/game/players/${encodeURIComponent(profileId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { player?: PublicPlayerDetail; error?: string };
      if (!response.ok || !payload.player) throw new Error(payload.error || "참가자 정보를 불러오지 못했습니다.");
      setSelectedPlayer(payload.player);
    } catch (playerError) {
      setError(playerError instanceof Error ? playerError.message : "참가자 정보를 불러오지 못했습니다.");
    } finally {
      setLeagueLoading(false);
    }
  }, []);

  const loadAdmin = useCallback(async (signal?: AbortSignal) => {
    const [response, accessResponse] = await Promise.all([
      fetch("/api/admin/game/seasons", { signal, cache: "no-store" }),
      fetch("/api/admin/access-requests", { signal, cache: "no-store" }),
    ]);
    if (accessResponse.status === 403) {
      setAdmin(null);
      return;
    }
    const accessPayload = (await accessResponse.json()) as { requests?: AccessRequest[]; error?: string };
    if (!accessResponse.ok || !accessPayload.requests) throw new Error(accessPayload.error || "접근 요청을 불러오지 못했습니다.");
    setAccessRequests(accessPayload.requests);
    const payload = (await response.json()) as { admin?: AdminGameOverview; error?: string };
    if (!response.ok || !payload.admin) {
      setAdmin(null);
      return;
    }
    setAdmin(payload.admin);
    setAnalysisModelDraft(payload.admin.analysisModel.selectedModel);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

    fetch("/api/game/me", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { game?: GameOverview; error?: string };
        if (!response.ok || !payload.game) {
          throw new Error(payload.error || "리그 정보를 불러오지 못했습니다.");
        }
        setGame(payload.game);
        setNickname(payload.game.profile?.nickname ?? "");
        setActivityFeedVisible(payload.game.profile?.activityFeedVisible ?? true);
        setLoading(false);
        if (payload.game.status === "ready" || payload.game.isAdmin) {
          const tasks = payload.game.status === "ready" ? [loadPortfolio(controller.signal), loadLeague(false, controller.signal), loadResearch(undefined, controller.signal)] : [];
          if (payload.game.isAdmin) tasks.push(loadAdmin(controller.signal));
          void Promise.allSettled(tasks).then((outcomes) => {
            if (controller.signal.aborted) return;
            const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
            if (rejected) setError(rejected.reason instanceof Error ? rejected.reason.message : "리그 상세 정보를 불러오지 못했습니다.");
          });
        }
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name !== "AbortError") {
          setError(fetchError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [loadAdmin, loadLeague, loadPortfolio, loadResearch, onClose]);

  async function enroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/game/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, acceptedRules, activityFeedVisible }),
      });
      const payload = (await response.json()) as { game?: GameOverview; error?: string };
      if (!response.ok || !payload.game) {
        throw new Error(payload.error || "리그 참가 정보를 저장하지 못했습니다.");
      }
      setGame(payload.game);
      if (payload.game.status === "ready") {
        const tasks = [loadPortfolio(), loadLeague(), loadResearch()];
        if (payload.game.isAdmin) tasks.push(loadAdmin());
        await Promise.all(tasks);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "리그 참가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function createResearchNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!researchTicker || !researchNoteDraft.trim()) return;
    if (researchChartImage && (!ticker || ticker.code !== researchTicker.code || ticker.market !== researchTicker.market)) {
      setError("첨부 차트와 분석 종목이 다릅니다. 현재 차트 종목을 선택하거나 첨부를 제거해 주세요.");
      return;
    }
    setResearchSaving(true);
    setError("");
    setLeagueNotice("");
    try {
      const body = new FormData();
      body.set("symbol", researchTicker.code);
      body.set("market", researchTicker.market);
      body.set("researchNote", researchNoteDraft);
      body.set("analysisDate", researchAnalysisDate);
      if (researchChartImage) body.set("chartImage", researchChartImage, "chart.png");
      const response = await fetch("/api/game/research-notes", {
        method: "POST",
        body,
      });
      const payload = await response.json() as { note?: LeagueResearchNote; error?: string };
      if (!response.ok || !payload.note) throw new Error(payload.error || "분석 노트를 공개하지 못했습니다.");
      setResearch((current) => current ? { notes: [payload.note!, ...current.notes], nextCursor: current.nextCursor, total: current.total + 1 } : { notes: [payload.note!], nextCursor: null, total: 1 });
      setResearchNoteDraft("");
      setResearchChartImage(null);
      setResearchQuery("");
      setResearchTicker(null);
      setResearchAnalysisDate(localDateInputValue());
      setLeagueNotice("분석 노트를 리그 참가자에게 공개했습니다.");
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : "분석 노트를 공개하지 못했습니다.");
    } finally {
      setResearchSaving(false);
    }
  }

  async function deleteResearchNote(id: string) {
    setResearchSaving(true);
    setError("");
    try {
      const response = await fetch("/api/game/research-notes", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "분석 노트를 삭제하지 못했습니다.");
      setResearch((current) => current ? { ...current, notes: current.notes.filter((note) => note.id !== id), total: Math.max(0, current.total - 1) } : current);
      setExpandedResearchNoteIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : "분석 노트를 삭제하지 못했습니다.");
    } finally {
      setResearchSaving(false);
    }
  }

  async function submitTrade(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticker || !tradeConfirming) return;
    setTradeSubmitting(true);
    setError("");
    setLeagueNotice("");
    setReceipt(null);
    try {
      const response = await fetch("/api/game/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: ticker.code,
          market: ticker.market,
          side: tradeSide,
          quantity: tradeQuantity,
          tradeNote,
          clientOrderId: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as { receipt?: TradeReceipt; error?: string };
      if (!response.ok || !payload.receipt) {
        throw new Error(payload.error || "모의 주문을 체결하지 못했습니다.");
      }
      setReceipt(payload.receipt);
      setTradeNote("");
      setTradeQuantity(1);
      setQuickBuyAllocation(null);
      setTradeConfirming(false);
      await loadPortfolio();
      try {
        await loadLeague(false);
        setLeagueNotice("체결 내역과 활동을 반영했습니다. 순위는 필요할 때 현재 시세로 갱신해 주세요.");
      } catch {
        setLeagueNotice("체결은 완료됐습니다. 순위와 활동은 탭에서 다시 불러와 주세요.");
      }
    } catch (tradeError) {
      setError(tradeError instanceof Error ? tradeError.message : "모의 주문을 체결하지 못했습니다.");
    } finally {
      setTradeSubmitting(false);
    }
  }

  async function selectLeagueTab(nextTab: "portfolio" | "ranking" | "activity" | "research" | "admin") {
    setLeagueTab(nextTab);
    setError("");
    setLeagueNotice("");
    if (nextTab === "ranking" || nextTab === "activity") {
      try {
        await loadLeague(false);
        if (nextTab === "ranking") await loadPortfolio();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "리그 정보를 갱신하지 못했습니다.");
      }
    }
    if (nextTab === "research") {
      try {
        await loadResearch();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "분석 노트를 갱신하지 못했습니다.");
      }
    }
    if (nextTab === "admin") {
      try {
        await loadAdmin();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "리그 운영 정보를 불러오지 못했습니다.");
      }
    }
  }

  async function refreshRanking() {
    if (leagueRefreshRemaining > 0) return;
    setError("");
    setLeagueNotice("");
    try {
      await loadLeague(true);
      await loadPortfolio();
      setLeagueNotice("모든 참가자의 순위를 현재 시세로 갱신했습니다.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "평가를 갱신하지 못했습니다.");
    }
  }

  async function createAdminSeason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/game/seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...adminDraft,
          startsAt: new Date(adminDraft.startsAt).toISOString(),
          endsAt: new Date(adminDraft.endsAt).toISOString(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "시즌을 만들지 못했습니다.");
      setAdminDraft({ name: "", slug: "", startsAt: "", endsAt: "", initialCashKrw: "100000000", status: "draft" });
      await loadAdmin();
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "시즌을 만들지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateAnalysisModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnalysisModelSaving(true);
    setError("");
    setLeagueNotice("");
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      const response = await fetch("/api/admin/analysis/model", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: analysisModelDraft }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const payload = (await response.json()) as { analysisModel?: AdminGameOverview["analysisModel"] & { updatedAt?: string }; error?: string };
      if (!response.ok || !payload.analysisModel) throw new Error(payload.error || "AI 모델 설정을 저장하지 못했습니다.");
      setAdmin((current) => current ? { ...current, analysisModel: payload.analysisModel! } : current);
      setAnalysisModelDraft(payload.analysisModel.selectedModel);
      setLeagueNotice(`AI 심층분석 모델을 ${payload.analysisModel.selectedModel}(으)로 변경했습니다.`);
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "AI 모델 설정을 저장하지 못했습니다.");
    } finally {
      setAnalysisModelSaving(false);
    }
  }

  async function decideAccessRequest(id: string, status: "approved" | "rejected") {
    setAccessRequestSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const payload = await response.json() as { request?: AccessRequest; error?: string };
      if (!response.ok || !payload.request) throw new Error(payload.error || "접근 요청을 처리하지 못했습니다.");
      setAccessRequests((current) => current.map((request) => request.id === id ? payload.request! : request));
      setLeagueNotice(status === "approved" ? "접근 요청을 승인했습니다." : "접근 요청을 거절했습니다.");
    } catch (accessError) {
      setError(accessError instanceof Error ? accessError.message : "접근 요청을 처리하지 못했습니다.");
    } finally {
      setAccessRequestSavingId(null);
    }
  }

  const availableCashKrw = Math.max(0, Number(dashboard?.portfolio.cashKrw ?? game?.portfolio?.cashKrw ?? 0));
  const visibleResearchNotes = research?.notes.slice(0, researchVisibleCount) ?? [];
  const estimatedUnitKrw = ticker
    ? ticker.price * (ticker.currency === "USD" ? ticker.exchangeRate ?? 0 : 1)
    : 0;
  const estimatedTradeKrw = estimatedUnitKrw * tradeQuantity;

  function quantityForAllocation(allocation: QuickBuyAllocation) {
    if (!Number.isFinite(availableCashKrw) || !Number.isFinite(estimatedUnitKrw) || estimatedUnitKrw <= 0) return 0;
    return Math.min(1_000_000, Math.floor((availableCashKrw * allocation / 100) / estimatedUnitKrw));
  }

  function applyQuickBuyAllocation(allocation: QuickBuyAllocation) {
    const quantity = quantityForAllocation(allocation);
    if (quantity < 1) return;
    setTradeQuantity(quantity);
    setQuickBuyAllocation(allocation);
    setTradeConfirming(false);
  }

  return (
    <div className="league-dialog-backdrop" role="presentation">
      <section
        className="league-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="league-dialog-title"
      >
        <button ref={closeButtonRef} className="league-dialog-close" type="button" onClick={onClose} aria-label="선 넘는 리그 닫기">×</button>
        <div className="league-dialog-heading">
          <span className="league-mark">₩</span>
          <div>
            <p>LINE BREAKER PAPER LEAGUE</p>
            <h2 id="league-dialog-title">선 넘는 리그</h2>
          </div>
        </div>

        {loading ? (
          <div className="league-loading"><span />리그 정보를 불러오는 중…</div>
        ) : !game ? (
          <div className="league-unavailable">
            <strong>리그 정보를 불러오지 못했습니다.</strong>
            <p>{error || "잠시 후 다시 시도해 주세요."}</p>
          </div>
        ) : game.status === "ready" && game.season && game.profile && game.portfolio ? (
          <div className="league-ready">
            <div className="league-season-line">
              <span>진행 중</span>
              <strong>{game.season.name}</strong>
            </div>
            <div className="league-player">
              <small>플레이어</small>
              <strong>{game.profile.nickname}</strong>
            </div>
            <div className="league-tabs" role="tablist" aria-label="리그 메뉴">
              <button type="button" role="tab" aria-selected={leagueTab === "portfolio"} className={leagueTab === "portfolio" ? "active" : ""} onClick={() => void selectLeagueTab("portfolio")}>내 투자</button>
              <button type="button" role="tab" aria-selected={leagueTab === "ranking"} className={leagueTab === "ranking" ? "active" : ""} onClick={() => void selectLeagueTab("ranking")}>순위</button>
              <button type="button" role="tab" aria-selected={leagueTab === "activity"} className={leagueTab === "activity" ? "active" : ""} onClick={() => void selectLeagueTab("activity")}>활동</button>
              <button type="button" role="tab" aria-selected={leagueTab === "research"} className={leagueTab === "research" ? "active" : ""} onClick={() => void selectLeagueTab("research")}>분석 노트</button>
              {game.isAdmin && <button type="button" role="tab" aria-selected={leagueTab === "admin"} className={`admin-tab${leagueTab === "admin" ? " active" : ""}`} onClick={() => void selectLeagueTab("admin")}>운영</button>}
            </div>

            {leagueTab === "portfolio" && <>
              <div className="league-balance-grid">
              <article><span>보유 현금</span><strong>{formatKrwAmount(dashboard?.portfolio.cashKrw ?? game.portfolio.cashKrw)}</strong></article>
              <article><span>총 평가자산</span><strong>{formatKrwAmount(dashboard?.portfolio.equityKrw ?? game.portfolio.equityKrw)}</strong></article>
              </div>

            {ticker && supportsPaperTrading(ticker) && (
              <form className="league-trade-ticket" onSubmit={submitTrade}>
                <div className="league-section-title">
                  <div><span>SIMULATED ORDER</span><strong>{ticker.name} <small>{ticker.code} · {ticker.market}</small></strong></div>
                  <em>사이버 머니 · 실제 주문 아님</em>
                </div>
                <div className="league-trade-controls">
                  <div className="league-side-buttons" aria-label="모의 주문 방향">
                    <button type="button" className={tradeSide === "buy" ? "active buy" : ""} onClick={() => { setTradeSide("buy"); setQuickBuyAllocation(null); setTradeConfirming(false); }}>매수</button>
                    <button type="button" className={tradeSide === "sell" ? "active sell" : ""} onClick={() => { setTradeSide("sell"); setQuickBuyAllocation(null); setTradeConfirming(false); }}>매도</button>
                  </div>
                  <label><span>수량</span><input type="number" min="1" max="1000000" step="1" value={tradeQuantity} onChange={(event) => { setTradeQuantity(Math.max(1, Math.min(1_000_000, Math.floor(Number(event.target.value) || 1)))); setQuickBuyAllocation(null); setTradeConfirming(false); }} /></label>
                  <div className="league-trade-estimate"><span>화면가 기준 예상</span><strong>{estimatedTradeKrw > 0 ? `${formatPrice(estimatedTradeKrw)}원` : "서버에서 계산"}</strong></div>
                </div>
                {tradeSide === "buy" && (
                  <div className="league-buy-allocation" aria-label="보유 현금 기준 빠른 매수">
                    <div><span>보유 현금으로 빠른 매수</span><small>{formatKrwAmount(String(availableCashKrw))} 기준</small></div>
                    <div>
                      {QUICK_BUY_ALLOCATIONS.map(({ label, value }) => {
                        const quantity = quantityForAllocation(value);
                        return <button key={value} type="button" className={quickBuyAllocation === value ? "active" : ""} aria-pressed={quickBuyAllocation === value} disabled={quantity < 1} title={quantity > 0 ? `${quantity.toLocaleString("ko-KR")}주 자동 입력` : "해당 금액으로 1주 미만"} onClick={() => applyQuickBuyAllocation(value)}>{label}</button>;
                      })}
                    </div>
                    <small>화면 시세로 수량을 계산하며, 체결 시 서버가 최신 시세와 주문 가능 현금을 다시 확인합니다.</small>
                  </div>
                )}
                <div className="league-trade-note">
                  <div className="league-trade-note-head"><label htmlFor="league-trade-note">매매 메모 <small>선택</small></label><span>{Array.from(tradeNote).length}/200</span></div>
                  <div className="league-trade-note-tags" aria-label="매매 메모 빠른 태그">
                    {["#실적", "#돌파", "#저평가", "#테마", "#장기투자"].map((tag) => <button key={tag} type="button" onClick={() => { setTradeNote((current) => current.includes(tag) ? current : Array.from(`${tag}${current ? ` ${current}` : ""}`).slice(0, 200).join("")); setTradeConfirming(false); }}>{tag}</button>)}
                  </div>
                  <textarea id="league-trade-note" maxLength={200} rows={3} placeholder="왜 이 종목을 선택했는지 간단히 남겨보세요." value={tradeNote} onChange={(event) => { setTradeNote(event.target.value); setTradeConfirming(false); }} />
                  <small>체결 후 수정할 수 없습니다. 공개 활동은 내 활동 공개 설정을 따릅니다.</small>
                </div>
                {tradeConfirming ? (
                  <div className="league-trade-confirmation">
                    <p><strong>{ticker.name}</strong> {tradeSide === "buy" ? "매수" : "매도"} {tradeQuantity.toLocaleString("ko-KR")}주</p>
                    {tradeNote.trim() && <blockquote>{tradeNote.trim()}</blockquote>}
                    <small>확정 시 서버가 최신 지연 시세와 환율을 다시 조회합니다. 화면의 예상 금액과 실제 모의 체결 금액은 다를 수 있습니다.</small>
                    <div><button type="button" onClick={() => setTradeConfirming(false)}>취소</button><button type="submit" disabled={tradeSubmitting}>{tradeSubmitting ? "체결 중…" : "서버 시세로 체결 확정"}</button></div>
                  </div>
                ) : (
                  <button className="league-trade-review" type="button" onClick={() => setTradeConfirming(true)}>주문 내용 확인</button>
                )}
              </form>
            )}

            {receipt && (
              <div className="league-receipt" role="status">
                <div><span>체결 완료</span><strong>{receipt.securityName} · {receipt.side === "buy" ? "매수" : "매도"} {receipt.quantity}주</strong></div>
                <dl>
                  <div><dt>체결가</dt><dd>{receipt.nativeCurrency === "USD" ? `$${Number(receipt.nativePrice).toLocaleString("en-US")}` : `${formatPrice(Number(receipt.nativePrice))}원`}</dd></div>
                  <div><dt>원화 금액</dt><dd>{formatKrwAmount(receipt.grossKrw)}</dd></div>
                  <div><dt>시세 시각</dt><dd>{new Date(receipt.quoteAt).toLocaleString("ko-KR")}</dd></div>
                  <div><dt>환율</dt><dd>{receipt.nativeCurrency === "USD" ? `${Number(receipt.fxRate).toFixed(2)} · ${new Date(receipt.fxAt).toLocaleString("ko-KR")}` : "KRW 1:1"}</dd></div>
                </dl>
                {receipt.tradeNote && <p className="league-trade-note-copy">“{receipt.tradeNote}”</p>}
              </div>
            )}

            <div className="league-portfolio-section">
              <div className="league-section-title"><div><span>MY PORTFOLIO</span><strong>보유종목</strong></div><em>{dashboard?.portfolio.valuationNote}</em></div>
              {portfolioLoading ? <div className="league-inline-loading">내 투자 정보를 갱신하는 중…</div> : dashboard?.holdings.length ? (
                <div className="league-holdings">
                  {dashboard.holdings.map((holding) => (
                    <button type="button" key={`${holding.market}:${holding.symbol}`} onClick={() => onOpenChart(leagueSecurityTicker({ ...holding, nativePrice: holding.lastNativePrice }))} aria-label={`${holding.securityName} 차트 보기`}>
                      <div><strong>{holding.securityName}</strong><small>{holding.symbol} · {holding.market} · {holding.quantity.toLocaleString("ko-KR")}주</small></div>
                      <div><strong>{formatKrwAmount(holding.marketValueKrw)}</strong><small className={Number(holding.unrealizedPnlKrw) >= 0 ? "positive" : "negative"}>평가손익 {formatKrwAmount(holding.unrealizedPnlKrw)}{holdingReturnPct(holding) === null ? "" : ` · ${holdingReturnPct(holding)! >= 0 ? "+" : ""}${holdingReturnPct(holding)!.toFixed(2)}%`}</small></div>
                    </button>
                  ))}
                </div>
              ) : <p className="league-empty-copy">아직 보유종목이 없습니다.</p>}
            </div>

            <div className="league-portfolio-section">
              <div className="league-section-title"><div><span>RECENT FILLS</span><strong>최근 체결</strong></div></div>
              {dashboard?.orders.length ? (
                <div className="league-order-history">
                  {dashboard.orders.slice(0, 8).map((order) => (
                    <button type="button" key={order.orderId} onClick={() => onOpenChart(leagueSecurityTicker({ symbol: order.symbol, securityName: order.securityName, market: order.market, nativeCurrency: order.nativeCurrency, nativePrice: order.nativePrice }))} aria-label={`${order.securityName} 차트 보기`}>
                      <span className={order.side}>{order.side === "buy" ? "매수" : "매도"}</span>
                      <div>
                        <strong>{order.securityName}</strong>
                        <small>{order.market} · {order.symbol} · {order.quantity.toLocaleString("ko-KR")}주 · {new Date(order.executedAt).toLocaleString("ko-KR")}</small>
                        <small className="league-order-fill-detail">체결단가 {formatNativeTradePrice(order.nativePrice, order.nativeCurrency)} · 원화 {formatTradeUnitKrw(order.grossKrw, order.quantity)}/주{order.nativeCurrency === "USD" ? ` · 환율 ${Number(order.fxRate).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}` : ""}</small>
                        {order.tradeNote && <q>{order.tradeNote}</q>}
                      </div>
                      <em><small>총 체결</small>{formatKrwAmount(order.grossKrw)}</em>
                    </button>
                  ))}
                </div>
              ) : <p className="league-empty-copy">아직 체결내역이 없습니다.</p>}
            </div>
            </>}

            {leagueTab === "ranking" && (
              <div className="league-ranking-section" role="tabpanel">
                <div className="league-section-title">
                  <div><span>LIVE STANDINGS</span><strong>투자 순위</strong></div>
                  <button type="button" className="league-refresh" disabled={leagueLoading || leagueRefreshRemaining > 0} onClick={() => void refreshRanking()}>{leagueLoading ? "평가 중…" : leagueRefreshRemaining > 0 ? `${leagueRefreshRemaining}초 후 갱신` : "현재 시세로 갱신"}</button>
                </div>
                {league?.snapshot && <p className="league-snapshot-time">평가 {new Date(league.snapshot.valuationAt).toLocaleString("ko-KR")} · 가장 오래된 시세 {league.snapshot.oldestQuoteAt ? new Date(league.snapshot.oldestQuoteAt).toLocaleString("ko-KR") : "현금만 보유"}</p>}
                {leagueLoading && !league ? <div className="league-inline-loading">모든 참가자의 포트폴리오를 평가하는 중…</div> : league?.participants.length ? (
                  <div className="league-ranking-list">
                    {league.participants.map((participant) => (
                      <button type="button" key={participant.profileId} className={participant.isMe ? "me" : ""} onClick={() => loadPlayer(participant.profileId)}>
                        <span className="league-rank-number">{participant.rank}</span>
                        <span className="league-rank-player"><strong>{participant.nickname}{participant.isMe ? " · 나" : ""}</strong><small>{participant.badges.join(" · ") || participant.topHoldings.map((holding) => holding.securityName).join(" · ") || "아직 투자 전"}</small></span>
                        <span className="league-rank-value"><strong>{formatKrwAmount(participant.equityKrw)}</strong><small className={Number(participant.totalReturnPct) >= 0 ? "positive" : "negative"}>{Number(participant.totalReturnPct) >= 0 ? "+" : ""}{Number(participant.totalReturnPct).toFixed(2)}% {participant.rankMovement === null ? "" : participant.rankMovement > 0 ? `▲${participant.rankMovement}` : participant.rankMovement < 0 ? `▼${Math.abs(participant.rankMovement)}` : "—"}</small></span>
                      </button>
                    ))}
                  </div>
                ) : <p className="league-empty-copy">첫 순위표를 만들려면 현재 시세로 갱신해 주세요.</p>}

                {selectedPlayer && (
                  <div className="league-player-detail">
                    <div className="league-player-detail-head"><div><small>#{selectedPlayer.rank}</small><strong>{selectedPlayer.nickname}</strong></div><button type="button" onClick={() => setSelectedPlayer(null)} aria-label="참가자 상세 닫기">×</button></div>
                    <div className="league-player-detail-metrics"><span>수익률 <b className={Number(selectedPlayer.totalReturnPct) >= 0 ? "positive" : "negative"}>{Number(selectedPlayer.totalReturnPct) >= 0 ? "+" : ""}{Number(selectedPlayer.totalReturnPct).toFixed(2)}%</b></span><span>현금비중 <b>{Number(selectedPlayer.cashRatioPct).toFixed(1)}%</b><small>{formatKrwAmount(selectedPlayer.cashKrw)} ÷ {formatKrwAmount(selectedPlayer.equityKrw)}</small></span></div>
                    <div className="league-holdings">
                      {selectedPlayer.holdings.length ? selectedPlayer.holdings.map((holding) => <button type="button" key={`${holding.market}:${holding.symbol}`} onClick={() => onOpenChart(leagueSecurityTicker({ ...holding, nativePrice: holding.lastNativePrice }))} aria-label={`${holding.securityName} 차트 보기`}><div><strong>{holding.securityName}</strong><small>{holding.symbol} · {holding.market} · {holding.quantity.toLocaleString("ko-KR")}주</small></div><div><strong>{formatKrwAmount(holding.marketValueKrw)}</strong><small className={Number(holding.unrealizedPnlKrw) >= 0 ? "positive" : "negative"}>평가손익 {formatKrwAmount(holding.unrealizedPnlKrw)}{holdingReturnPct(holding) === null ? "" : ` · ${holdingReturnPct(holding)! >= 0 ? "+" : ""}${holdingReturnPct(holding)!.toFixed(2)}%`}</small></div></button>) : <p className="league-empty-copy">보유종목이 없습니다.</p>}
                    </div>
                    {!selectedPlayer.activityHidden && selectedPlayer.recentTrades.length > 0 && <div className="league-player-trades"><strong>최근 매매</strong>{selectedPlayer.recentTrades.map((activity) => <button type="button" key={activity.id} onClick={() => onOpenChart(leagueSecurityTicker(activity))}><span className={activity.side}>{activity.side === "buy" ? "매수" : "매도"}</span><div><b>{activity.securityName}</b><small>{activity.market} · {activity.symbol} · {activity.quantity.toLocaleString("ko-KR")}주 · {new Date(activity.executedAt).toLocaleString("ko-KR")}</small><small className="league-player-fill-detail">체결단가 {formatNativeTradePrice(activity.nativePrice, activity.nativeCurrency)} · 원화 {formatTradeUnitKrw(activity.grossKrw, activity.quantity)}/주{activity.nativeCurrency === "USD" ? ` · 환율 ${Number(activity.fxRate).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}` : ""}</small>{activity.tradeNote && <q>{activity.tradeNote}</q>}</div><em><small>총 체결</small>{formatKrwAmount(activity.grossKrw)}</em></button>)}</div>}
                    {selectedPlayer.activityHidden && <p className="league-snapshot-time">이 참가자는 매매 활동 피드를 비공개로 설정했습니다.</p>}
                  </div>
                )}
              </div>
            )}

            {leagueTab === "activity" && (
              <div className="league-ranking-section" role="tabpanel">
                <div className="league-section-title"><div><span>LEAGUE TAPE</span><strong>최근 활동</strong></div><button type="button" className="league-refresh" disabled={leagueLoading} onClick={() => void selectLeagueTab("activity")}>{leagueLoading ? "불러오는 중…" : "새로고침"}</button></div>
                <p className="league-snapshot-time">공개에 동의한 참가자의 체결만 표시합니다. 메모는 개인 의견이며 투자 권유가 아닙니다.</p>
                {league?.activity.length ? <div className="league-activity-list">{league.activity.map((activity) => <article key={activity.id}><span className={activity.side}>{activity.side === "buy" ? "매수" : "매도"}</span><div><button type="button" className="league-player-link" onClick={() => loadPlayer(activity.profileId)}>{activity.nickname}</button><button type="button" className="league-stock-link" onClick={() => onOpenChart(leagueSecurityTicker(activity))}>{activity.securityName} <small>차트 →</small></button><small>{activity.market} {activity.symbol} · {activity.quantity.toLocaleString("ko-KR")}주 · {new Date(activity.executedAt).toLocaleString("ko-KR")}</small>{activity.tradeNote && <q>{activity.tradeNote}</q>}</div><em>{formatKrwAmount(activity.grossKrw)}</em></article>)}</div> : <p className="league-empty-copy">공개된 매매 활동이 아직 없습니다.</p>}
              </div>
            )}

            {leagueTab === "research" && (
              <div className="league-research-section" role="tabpanel">
                <div className="league-section-title"><div><span>SHARED RESEARCH</span><strong>공개 분석 노트</strong></div><button type="button" className="league-refresh" disabled={researchLoading} onClick={() => void loadResearch()}>{researchLoading ? "불러오는 중…" : "새로고침"}</button></div>
                <p className="league-snapshot-time">같은 종목도 분석 시점별로 여러 번 기록할 수 있습니다. 공개 글은 리그 참가자에게만 보이며, 개인 분석은 투자 권유가 아닙니다.</p>
                <form className="research-note-form" onSubmit={createResearchNote}>
                  <div className="research-note-form-heading"><div><span>NEW NOTE</span><strong>분석 기록 남기기</strong></div>{ticker && <button type="button" onClick={() => { setResearchTicker(ticker); setResearchQuery(ticker.code); setResearchSearchResults([]); }}>현재 차트 종목 선택</button>}</div>
                  <label className="research-search-field"><span>종목</span><input value={researchQuery} onChange={(event) => { const value = event.target.value; setResearchQuery(value); setResearchTicker(null); if (!value.trim()) setResearchSearchResults([]); }} placeholder="종목명·티커·초성 검색 (예: ㅅㅅㅈㅈ)" autoComplete="off" /></label>
                  {researchSearchResults.length > 0 && <div className="research-search-results" role="listbox" aria-label="분석할 종목 선택">{researchSearchResults.map((item) => <button type="button" key={`${item.market}:${item.code}`} onClick={() => { setResearchTicker(item); setResearchQuery(`${item.name} (${item.code})`); setResearchSearchResults([]); }}><strong>{item.name}</strong><small>{item.code} · {item.market} · {item.assetType}</small></button>)}</div>}
                  {researchTicker && <div className="research-selected-security"><strong>{researchTicker.name}</strong><span>{researchTicker.code} · {researchTicker.market} · {researchTicker.assetType}</span><button type="button" onClick={() => { setResearchTicker(null); setResearchQuery(""); }}>변경</button></div>}
                  <label className="research-date-field"><span>분석 기준일</span><input required type="date" value={researchAnalysisDate} onChange={(event) => setResearchAnalysisDate(event.target.value)} /></label>
                  {ticker && <div className="research-chart-attachment">
                    <div><strong>차트 첨부</strong><small>{researchChartImage ? "현재 차트가 첨부됩니다. 추세선·이평선도 함께 저장됩니다." : "현재 차트를 PNG로 첨부할 수 있습니다."}</small></div>
                    <div>
                      {researchChartImage ? <button type="button" onClick={() => setResearchChartImage(null)}>첨부 제거</button> : <button type="button" disabled={researchChartAttaching} onClick={() => {
                        void (async () => {
                          setResearchChartAttaching(true);
                          setError("");
                          try {
                            const image = await onCaptureChart();
                            if (!image) throw new Error("현재 차트를 이미지로 만들지 못했습니다. 차트가 표시된 뒤 다시 시도해 주세요.");
                            if (image.size > 3 * 1024 * 1024) throw new Error("현재 차트 이미지가 너무 큽니다. 표시 봉 수를 줄인 뒤 다시 시도해 주세요.");
                            setResearchChartImage(image);
                            if (!researchTicker) {
                              setResearchTicker(ticker);
                              setResearchQuery(`${ticker.name} (${ticker.code})`);
                            }
                          } catch (attachmentError) {
                            setError(attachmentError instanceof Error ? attachmentError.message : "차트 첨부를 준비하지 못했습니다.");
                          } finally {
                            setResearchChartAttaching(false);
                          }
                        })();
                      }}>{researchChartAttaching ? "준비 중…" : "현재 차트 첨부"}</button>}
                    </div>
                  </div>}
                  <label className="research-body-field"><span>분석 메모 <small>Markdown 지원 · 최대 10,000자</small></span><textarea required rows={12} maxLength={10000} value={researchNoteDraft} onChange={(event) => setResearchNoteDraft(event.target.value)} placeholder={"## 핵심 관점\n\n- 주목한 이유\n- 확인할 위험\n\n| 항목 | 내용 |\n| --- | --- |\n| 촉매 | 실적 발표 |"} /><small>{Array.from(researchNoteDraft).length.toLocaleString("ko-KR")} / 10,000자 · HTML은 표시되지 않습니다.</small></label>
                  <button className="research-publish-button" type="submit" disabled={!researchTicker || !researchNoteDraft.trim() || researchSaving}>{researchSaving ? "공개 중…" : "리그에 분석 노트 공개"}</button>
                </form>
                {researchLoading && !research ? <div className="league-inline-loading">공개 분석 노트를 불러오는 중…</div> : research?.notes.length ? <><p className="research-feed-count">전체 {research.total.toLocaleString("ko-KR")}개 · 최근 {Math.min(researchVisibleCount, research.notes.length).toLocaleString("ko-KR")}개 표시 중</p><div className="research-note-list">{visibleResearchNotes.map((note) => { const expanded = expandedResearchNoteIds.has(note.id); return <article key={note.id} className="research-note-card"><header><div><strong>{note.nickname}{note.isMine ? " · 나" : ""}</strong><button type="button" onClick={() => onOpenChart(leagueSecurityTicker(note))}>{note.securityName} <small>{note.symbol} · 차트 →</small></button><small>분석 기준일 {note.analysisDate} · 작성 {new Date(note.createdAt).toLocaleString("ko-KR")}</small></div><div><span>{note.assetType === "ETF" ? "ETF" : note.market}</span>{note.isMine && <button type="button" className="research-delete-button" disabled={researchSaving} onClick={() => void deleteResearchNote(note.id)}>삭제</button>}</div></header>{note.chartImageUrl && <a className="research-chart-image" href={note.chartImageUrl} target="_blank" rel="noreferrer"><img src={note.chartImageUrl} alt={`${note.securityName} 분석 차트`} /></a>}<ResearchNoteBody note={note.researchNote} expanded={expanded} />{note.researchNote && <button type="button" className="research-expand-button" aria-expanded={expanded} onClick={() => setExpandedResearchNoteIds((current) => { const next = new Set(current); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })}>{expanded ? "접기" : "전문 보기"}</button>}</article>; })}</div>{researchVisibleCount < research.notes.length && <button type="button" className="research-load-more" onClick={() => setResearchVisibleCount((current) => current + RESEARCH_FEED_STEP)}>분석 노트 5개 더 보기</button>}</> : <p className="league-empty-copy">아직 공개된 분석 노트가 없습니다.</p>}
                {research?.nextCursor && researchVisibleCount >= research.notes.length && <button type="button" className="research-load-more" disabled={researchLoading} onClick={() => { const cursor = research.nextCursor; if (cursor) void loadResearch(cursor); }}>{researchLoading ? "불러오는 중…" : "이전 분석 20개 불러오기"}</button>}
              </div>
            )}

            {leagueTab === "admin" && (
              <div className="league-admin-section" role="tabpanel">
                <AccessRequestAdminSection requests={accessRequests} savingId={accessRequestSavingId} onDecide={(id, status) => void decideAccessRequest(id, status)} />
                {admin && <><div className="league-section-title"><div><span>LEAGUE CONTROL</span><strong>시즌 운영</strong></div><em>DB admin 역할 전용</em></div>
                <form className="league-admin-model" onSubmit={updateAnalysisModel}>
                  <div><span>AI ANALYSIS</span><strong>심층분석 모델</strong><small>OpenRouter의 구조화 출력·웹 검색을 지원하는 모델 ID를 입력하세요.</small></div>
                  <label><span>현재 모델</span><input required list="analysis-model-suggestions" value={analysisModelDraft} onChange={(event) => setAnalysisModelDraft(event.target.value)} placeholder="provider/model" /><datalist id="analysis-model-suggestions">{admin.analysisModel.suggestions.map((model) => <option value={model} key={model} />)}</datalist></label>
                  <button type="submit" disabled={analysisModelSaving || !analysisModelDraft.trim()}>{analysisModelSaving ? "저장 중…" : "모델 적용"}</button>
                </form>
                <div className="league-admin-seasons">
                  {admin.seasons.map((season) => <article key={season.id}><div><strong>{season.name}</strong><small>{season.slug} · 규칙 v{season.ruleVersion}</small></div><div><span className={season.status}>{season.status}</span><small>{season.participantCount}명</small></div></article>)}
                </div>
                <form className="league-admin-form" onSubmit={createAdminSeason}>
                  <strong>새 시즌 초안</strong>
                  <label><span>시즌 이름</span><input required minLength={2} maxLength={100} value={adminDraft.name} onChange={(event) => setAdminDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={adminDraft.slug} onChange={(event) => setAdminDraft((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} /></label>
                  <label><span>시작 시각</span><input required type="datetime-local" value={adminDraft.startsAt} onChange={(event) => setAdminDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                  <label><span>종료 시각</span><input required type="datetime-local" value={adminDraft.endsAt} onChange={(event) => setAdminDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                  <label><span>시작 자금</span><input required inputMode="numeric" value={adminDraft.initialCashKrw} onChange={(event) => setAdminDraft((current) => ({ ...current, initialCashKrw: event.target.value }))} /></label>
                  <label><span>상태</span><select value={adminDraft.status} onChange={(event) => setAdminDraft((current) => ({ ...current, status: event.target.value }))}><option value="draft">초안</option><option value="open">즉시 공개</option></select></label>
                  <button type="submit" disabled={submitting}>{submitting ? "저장 중…" : "시즌 만들기"}</button>
                  <small>시즌 생성은 기존 원장이나 시즌을 초기화하지 않습니다.</small>
                </form>
                <div className="league-admin-audit"><strong>최근 감사 기록</strong>{admin.auditEvents.length ? admin.auditEvents.slice(0, 10).map((audit) => <article key={audit.id}><div><span>{audit.action}</span><small>{new Date(audit.createdAt).toLocaleString("ko-KR")}</small></div><code>{audit.requestId}</code></article>) : <p className="league-empty-copy">감사 기록이 없습니다.</p>}</div></>}
              </div>
            )}
            {error && <p className="league-error" role="alert">{error}</p>}
            {leagueNotice && <p className="league-notice" role="status">{leagueNotice}</p>}
            <p className="league-disclaimer">사이버 머니를 사용하는 모의투자입니다. 실제 주문이나 수익을 발생시키지 않습니다.</p>
          </div>
        ) : game?.status === "unavailable" ? (
          <div className="league-unavailable">
            <strong>지금은 참가 가능한 시즌이 없습니다.</strong>
            <p>다음 시즌이 열리면 이곳에서 바로 참가할 수 있습니다.</p>
          </div>
        ) : (
          <form className="league-onboarding" onSubmit={enroll}>
            <div className="league-season-intro">
              <span>WELCOME BONUS</span>
              <strong>{game?.season ? formatKrwAmount(game.season.initialCashKrw) : "1억 원"}</strong>
              <p>닉네임을 정하면 모의투자 포트폴리오와 시작 자금이 한 번만 지급됩니다.</p>
            </div>
            <label className="league-nickname-field">
              <span>리그 닉네임</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                minLength={2}
                maxLength={16}
                autoComplete="off"
                placeholder="2~16자"
                required
              />
              <small>한글·영문·숫자·공백·밑줄을 사용할 수 있습니다.</small>
            </label>
            <label className="league-check-row">
              <input type="checkbox" checked={acceptedRules} onChange={(event) => setAcceptedRules(event.target.checked)} />
              <span>사이버 머니 기반 모의투자이며 실제 주문이 아니라는 점에 동의합니다.</span>
            </label>
            <label className="league-check-row muted">
              <input type="checkbox" checked={activityFeedVisible} onChange={(event) => setActivityFeedVisible(event.target.checked)} />
              <span>내 매매 활동을 리그 피드에 공개</span>
            </label>
            {error && <p className="league-error" role="alert">{error}</p>}
            <button className="league-submit" type="submit" disabled={submitting || !acceptedRules}>
              {submitting ? "참가 처리 중…" : "1억 받고 리그 참가"}
            </button>
            {game?.isAdmin && admin && <AccessRequestAdminSection requests={accessRequests} savingId={accessRequestSavingId} onDecide={(id, status) => void decideAccessRequest(id, status)} />}
          </form>
        )}

        {error && game?.status === "ready" && !dashboard && <p className="league-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function Dashboard({ authUser }: { authUser: AuthUser }) {
  const [region, setRegion] = useState<Region>("kr");
  const [timeframe, setTimeframe] = useState<ScreeningTimeframe>("weekly");
  const [maPeriod, setMaPeriod] = useState<ScreeningMaPeriod>(10);
  const [market, setMarket] = useState<MarketFilter>("all");
  const [asset, setAsset] = useState<AssetFilter>("all");
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("weekly");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [marketWatchId, setMarketWatchId] = useState("kospi");
  const [workspaceTab, setWorkspaceTab] = useState<"markets" | "candidates">("markets");
  const [directTicker, setDirectTicker] = useState<Ticker | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [stockMatches, setStockMatches] = useState<Ticker[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [volumeFilter, setVolumeFilter] = useState("all");
  const [classificationFilters, setClassificationFilters] = useState<ClassificationFilter[]>([]);
  const [range, setRange] = useState(80);
  const [trendLineMode, setTrendLineMode] = useState(false);
  const [chartCopyStatus, setChartCopyStatus] = useState<"idle" | "copied" | "unsupported">("idle");
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChangeSet>(EMPTY_PRICE_CHANGES);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [indexMembership, setIndexMembership] = useState<boolean | null>(null);
  const [classification, setClassification] = useState<SecurityClassification | null>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [chartLoading, setChartLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [analysisTicker, setAnalysisTicker] = useState<Ticker | null>(null);
  const [leagueTicker, setLeagueTicker] = useState<Ticker | null>(null);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[] | null>(null);
  const chartCacheRef = useRef(new Map<string, { expiresAt: number; payload: ChartApiPayload }>());
  const chartCanvasRef = useRef<ChartCanvasHandle>(null);
  const closeLeague = useCallback(() => setLeagueOpen(false), []);
  const closeFavorites = useCallback(() => setFavoritesOpen(false), []);
  const chartPanelRef = useRef<HTMLElement>(null);
  const scanToken = useRef(0);
  const scanInProgressRef = useRef(false);
  const manualSelectionDuringScanRef = useRef(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failures: 0 });
  const [message, setMessage] = useState("스캔 전 · 주요 시장 흐름을 확인하세요");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/favorites", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("즐겨찾기를 불러오지 못했습니다.");
        return response.json() as Promise<{ lists?: FavoriteList[] }>;
      })
      .then((payload) => setFavoriteLists(payload.lists ?? []))
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setFavoriteLists(null);
      });
    return () => controller.abort();
  }, []);

  const openSavedSecurityChart = useCallback((nextTicker: Ticker) => {
    if (scanInProgressRef.current) manualSelectionDuringScanRef.current = true;
    if (nextTicker.assetType === "INDEX" && nextTicker.code.startsWith("MARKET:")) {
      setMarketWatchId(nextTicker.code.slice("MARKET:".length).toLowerCase());
      setWorkspaceTab("markets");
      setDirectTicker(null);
      setSelectedKey("");
      setStockQuery("");
      setStockMatches([]);
      setLeagueTicker(null);
      setLeagueOpen(false);
      window.requestAnimationFrame(() => {
        chartPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    setRegion(nextTicker.currency === "USD" ? "us" : "kr");
    setWorkspaceTab("candidates");
    setDirectTicker(nextTicker);
    setSelectedKey("");
    setStockQuery("");
    setStockMatches([]);
    setLeagueTicker(null);
    setLeagueOpen(false);
    setFavoritesOpen(false);
    window.requestAnimationFrame(() => {
      chartPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openMarketOverview = useCallback((watchId: string) => {
    if (scanInProgressRef.current) manualSelectionDuringScanRef.current = true;
    setMarketWatchId(watchId);
    setWorkspaceTab("markets");
    setDirectTicker(null);
    setSelectedKey("");
    setStockQuery("");
    setStockMatches([]);
    setStockSearching(false);
  }, []);

  useEffect(() => {
    if (!logoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLogoOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [logoOpen]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return results.filter((item) => {
      if (normalized && !`${item.name} ${item.code}`.toLowerCase().includes(normalized)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (volumeFilter !== "all" && item.volumeStatus !== volumeFilter) return false;
      const market = classificationFilters.find((filter) => filter.kind === "market");
      const sector = classificationFilters.find((filter) => filter.kind === "sector");
      const themes = classificationFilters.filter((filter) => filter.kind === "theme");
      if (market && item.market !== market.value) return false;
      if (sector && item.sector !== sector.value) return false;
      if (themes.some((filter) => !item.themes?.includes(filter.value))) return false;
      return true;
    });
  }, [results, query, statusFilter, volumeFilter, classificationFilters]);

  const hasClassificationFilter = (kind: ClassificationFilter["kind"], value: string) =>
    classificationFilters.some((filter) => filter.kind === kind && filter.value === value);
  const toggleClassificationFilter = (next: ClassificationFilter) => {
    setClassificationFilters((current) => {
      const exists = current.some((filter) => filter.kind === next.kind && filter.value === next.value);
      if (exists) return current.filter((filter) => !(filter.kind === next.kind && filter.value === next.value));
      // Market and sector are mutually exclusive dimensions; themes can be combined.
      const retained = next.kind === "market" || next.kind === "sector"
        ? current.filter((filter) => filter.kind !== next.kind)
        : current;
      return [...retained, next];
    });
  };

  const selectedCandidate = workspaceTab === "candidates"
    ? results.find((item) => candidateKey(item) === selectedKey) ?? filtered[0] ?? results[0]
    : undefined;
  const activeMarketWatch = MARKET_WATCHES.find((item) => item.id === marketWatchId) ?? MARKET_WATCHES[0];
  const isMarketOverview = workspaceTab === "markets" && !directTicker;
  const marketTicker: Ticker = {
    code: `MARKET:${activeMarketWatch.id.toUpperCase()}`,
    name: activeMarketWatch.name,
    market: activeMarketWatch.id === "sp500" || activeMarketWatch.id === "dow" || activeMarketWatch.id === "russell" || activeMarketWatch.id === "vix"
      ? "NYSE"
      : activeMarketWatch.id === "nasdaq100" || activeMarketWatch.id === "nasdaq" || activeMarketWatch.id === "sox"
        ? "NASDAQ"
        : activeMarketWatch.id === "kosdaq"
          ? "KOSDAQ"
          : activeMarketWatch.id === "kospi" || activeMarketWatch.id === "usdkrw"
            ? "KOSPI"
            : "GLOBAL",
    assetType: "INDEX",
    marketCap: 0,
    price: 0,
  };
  const selected = directTicker ?? selectedCandidate ?? marketTicker;
  const trendLineStorageKey = selected
    ? `line-breaker:trend-lines:v1:${selected.market}:${selected.assetType}:${selected.code}:${chartTimeframe}`
    : "line-breaker:trend-lines:v1:empty";
  const selectedIsFavorite = !isMarketOverview && (favoriteLists ?? []).some((list) =>
    list.items.some((item) => item.symbol === selected.code && item.market === selected.market),
  );
  const selectedSignal = directTicker || isMarketOverview ? undefined : selectedCandidate;
  const activeClassification = classification ?? (selected.sector ? { sector: selected.sector, industry: selected.industry, themes: selected.themes } : null);

  useEffect(() => {
    const normalized = stockQuery.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setStockSearching(true);
      fetch(`/api/search?query=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("종목 검색에 실패했습니다.");
          return response.json() as Promise<{ tickers: Ticker[] }>;
        })
        .then((payload) => setStockMatches(payload.tickers))
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") setStockMatches([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setStockSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [stockQuery]);

  // Favorites and league holdings are persisted with the information needed for
  // trading, not the full market-universe payload. Hydrate their metadata so the
  // detail card still shows the market cap (and the correct ETF/ETN badge).
  useEffect(() => {
    if (!directTicker || directTicker.marketCap > 0) return;
    const controller = new AbortController();
    fetch(`/api/search?query=${encodeURIComponent(directTicker.code)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("종목 정보를 불러오지 못했습니다.");
        return response.json() as Promise<{ tickers?: Ticker[] }>;
      })
      .then((payload) => {
        const matched = payload.tickers?.find((ticker) => ticker.code === directTicker.code && ticker.market === directTicker.market);
        if (!matched || controller.signal.aborted) return;
        setDirectTicker((current) => current?.code === directTicker.code && current.market === directTicker.market
          ? { ...current, ...matched, price: current.price || matched.price }
          : current);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [directTicker]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    // Loading state is deliberately reset when the selected security/timeframe changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChartLoading(true);
    setChart([]);
    setPriceChanges(EMPTY_PRICE_CHANGES);
    setIndexMembership(null);
    setClassification(null);
    const cacheKey = isMarketOverview
      ? `market:${activeMarketWatch.id}:${chartTimeframe}`
      : `${selected.market}:${selected.assetType}:${selected.code}:${chartTimeframe}`;
    const applyChartPayload = (payload: ChartApiPayload) => {
      setChart(payload.points);
      setPriceChanges(payload.changes ?? EMPTY_PRICE_CHANGES);
      setExchangeRate(payload.exchangeRate ?? selected.exchangeRate ?? null);
      setIndexMembership(payload.isNasdaq100 ?? selected.isNasdaq100 ?? null);
      setClassification(payload.classification ?? (selected.sector ? { sector: selected.sector, industry: selected.industry, themes: selected.themes } : null));
      const latest = payload.points.at(-1);
      if (latest) {
        setLatestPrices((current) =>
          current[selected.code] === latest.close
            ? current
            : { ...current, [selected.code]: latest.close },
        );
      }
    };
    const cached = chartCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      applyChartPayload(cached.payload);
      setChartLoading(false);
      return () => controller.abort();
    }
    const endpoint = isMarketOverview
      ? `/api/market-chart?id=${encodeURIComponent(activeMarketWatch.id)}&timeframe=${chartTimeframe}`
      : `/api/chart?code=${selected.code}&name=${encodeURIComponent(selected.name)}&market=${selected.market}&asset=${selected.assetType}&timeframe=${chartTimeframe}`;
    fetch(endpoint, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("차트를 불러오지 못했습니다.");
        return response.json() as Promise<ChartApiPayload>;
      })
      .then((payload) => {
        if (chartCacheRef.current.size >= 40) chartCacheRef.current.delete(chartCacheRef.current.keys().next().value!);
        chartCacheRef.current.set(cacheKey, { payload, expiresAt: Date.now() + 2 * 60_000 });
        applyChartPayload(payload);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChartLoading(false);
      });
    return () => controller.abort();
  // `selected` includes a synthetic market object; the stable identifiers above define the fetch boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.code, selected?.market, selected?.assetType, chartTimeframe, isMarketOverview, activeMarketWatch.id]);

  async function runFullScan() {
    const token = ++scanToken.current;
    scanInProgressRef.current = true;
    manualSelectionDuringScanRef.current = false;
    setDirectTicker(null);
    setWorkspaceTab("candidates");
    setScanning(true);
    setResults([]);
    setClassificationFilters([]);
    setProgress({ done: 0, total: 0, failures: 0 });
    setMessage("시장 종목 목록을 불러오는 중");
    try {
      const universeResponse = await fetch(`/api/universe?region=${region}&market=${market}&asset=${asset}`);
      if (!universeResponse.ok) throw new Error("시장 종목 목록을 불러오지 못했습니다.");
      const universePayload = (await universeResponse.json()) as { tickers: Ticker[] };
      const tickers = universePayload.tickers;
      setProgress({ done: 0, total: tickers.length, failures: 0 });
      const timeframeLabel = timeframe === "both" ? "주봉·월봉 AND" : timeframe === "weekly" ? "주봉" : "월봉";
      const maLabel = maPeriod === "both" ? "10·240이평 AND" : `${maPeriod}이평`;
      const conditionCount = (timeframe === "both" ? 2 : 1) * (maPeriod === "both" ? 2 : 1);
      const universeLabel = region !== "us"
        ? ""
        : asset === "etp"
          ? " · 주요 고유동성 ETF"
          : asset === "all"
            ? " · 상위 보통주 + 주요 고유동성 ETF"
            : " · 거래소별 시총 상위 1,000 보통주";
      setMessage(`${tickers.length.toLocaleString("ko-KR")}종목 · ${timeframeLabel} · ${maLabel} 분석 중${universeLabel}`);
      const batches: Ticker[][] = [];
      const batchSize = conditionCount >= 4 ? 8 : conditionCount === 2 ? 12 : 24;
      for (let index = 0; index < tickers.length; index += batchSize) batches.push(tickers.slice(index, index + batchSize));
      let cursor = 0;
      let done = 0;
      let failures = 0;
      const matches: Candidate[] = [];
      const workerCount = conditionCount >= 4 ? 2 : conditionCount === 2 ? 3 : 4;
      const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < batches.length && scanToken.current === token) {
          const batch = batches[cursor++];
          const response = await fetch("/api/screen", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tickers: batch, timeframe, maPeriod }),
          });
          if (!response.ok) {
            failures += batch.length * conditionCount;
          } else {
            const payload = (await response.json()) as {
              matches: Candidate[];
              failures: number;
              exchangeRate?: number;
            };
            matches.push(...payload.matches);
            if (payload.exchangeRate) setExchangeRate(payload.exchangeRate);
            failures += payload.failures;
          }
          done += batch.length;
          const sorted = [...matches].sort(compareCandidates);
          setResults(sorted);
          setProgress({ done, total: tickers.length, failures });
          setMessage(`${done.toLocaleString("ko-KR")} / ${tickers.length.toLocaleString("ko-KR")} 분석`);
        }
      });
      await Promise.all(workers);
      if (scanToken.current !== token) return;
      const sorted = matches.sort(compareCandidates);
      setResults(sorted);
      if (sorted[0]) {
        if (!manualSelectionDuringScanRef.current) setSelectedKey(candidateKey(sorted[0]));
      } else setWorkspaceTab("markets");
      const uniqueStocks = new Set(sorted.map((item) => item.code)).size;
      const usesAndCondition = timeframe === "both" || maPeriod === "both";
      const completedConditionLabel = [
        timeframe === "both" ? "주봉·월봉" : timeframe === "weekly" ? "주봉" : "월봉",
        maPeriod === "both" ? "10·240이평" : `${maPeriod}이평`,
      ].join(" · ");
      setMessage(
        usesAndCondition
          ? `방금 완료 · ${completedConditionLabel} 모두 돌파 ${uniqueStocks}종목${failures ? ` · ${failures}건 실패` : ""}`
          : `방금 완료 · ${sorted.length}개 신호 · ${uniqueStocks}종목${failures ? ` · ${failures}건 실패` : ""}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "스크리닝에 실패했습니다.");
    } finally {
      if (scanToken.current === token) {
        scanInProgressRef.current = false;
        setScanning(false);
      }
    }
  }

  function cancelScan() {
    scanToken.current += 1;
    scanInProgressRef.current = false;
    setScanning(false);
    setMessage("스크리닝을 중단했습니다.");
  }

  const nearCount = results.filter((item) => item.status === "근접 돌파").length;
  const volumeUpCount = results.filter((item) => item.volumeStatus === "증가").length;
  const uniqueStockCount = new Set(results.map((item) => item.code)).size;
  const usesAndFilter = timeframe === "both" || maPeriod === "both";
  const summaryConditionLabel = [
    timeframe === "both" ? "주·월" : timeframe === "weekly" ? "주봉" : "월봉",
    maPeriod === "both" ? "MA10·240" : `MA${maPeriod}`,
  ].join(" · ");
  const chartTimeframeLabel =
    chartTimeframe === "daily" ? "일봉" : chartTimeframe === "weekly" ? "주봉" : "월봉";
  const chartMaUnit =
    chartTimeframe === "daily" ? "일" : chartTimeframe === "weekly" ? "주" : "개월";
  const isUsdSecurity = !isMarketOverview && selected.currency === "USD";
  const priceUnit = isMarketOverview ? activeMarketWatch.unit : isUsdSecurity ? "USD" : "원";
  const appliedExchangeRate = exchangeRate ?? selected.exchangeRate ?? null;
  const hasScreenResults = results.length > 0 || scanning;
  const progressPct = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  const currentPeriod = chart.at(-1);
  const previousPeriod = chart.at(-2);
  const hasPeriodDetail = Boolean(currentPeriod && previousPeriod);
  const detailPreviousClose = hasPeriodDetail ? previousPeriod!.close : (selectedSignal?.previousClose ?? 0);
  const detailCurrentClose = hasPeriodDetail
    ? currentPeriod!.close
    : selected
      ? (latestPrices[selected.code] ?? selected.price ?? selectedSignal?.close ?? 0)
      : 0;
  // The league dialog remains open while the chart's latest close and USD/KRW
  // rate arrive. Keep its estimate in sync instead of freezing the values from
  // the instant the button was clicked (US ETFs start with a zero list price).
  const activeLeagueTicker = leagueTicker &&
    leagueTicker.code === selected.code &&
    leagueTicker.market === selected.market
    ? {
        ...leagueTicker,
        currency: selected.currency ?? leagueTicker.currency,
        price: detailCurrentClose > 0 ? detailCurrentClose : leagueTicker.price,
        exchangeRate: appliedExchangeRate ?? leagueTicker.exchangeRate,
      }
    : leagueTicker;
  const detailPreviousMa10 = hasPeriodDetail
    ? previousPeriod!.ma10
    : selectedSignal?.maPeriod === 10
      ? selectedSignal.previousMa
      : null;
  const detailCurrentMa10 = hasPeriodDetail
    ? currentPeriod!.ma10
    : selectedSignal?.maPeriod === 10
      ? selectedSignal.ma
      : null;
  const detailPreviousMa240 = hasPeriodDetail
    ? previousPeriod!.ma240
    : selectedSignal?.maPeriod === 240
      ? selectedSignal.previousMa
      : null;
  const detailCurrentMa240 = hasPeriodDetail
    ? currentPeriod!.ma240
    : selectedSignal?.maPeriod === 240
      ? selectedSignal.ma
      : null;
  const detailPreviousVolume = hasPeriodDetail ? previousPeriod!.volume : (selectedSignal?.previousVolume ?? 0);
  const detailCurrentVolume = hasPeriodDetail ? currentPeriod!.volume : (selectedSignal?.volume ?? 0);
  const detailGap10Pct =
    detailCurrentMa10 && detailCurrentMa10 > 0
      ? ((detailCurrentClose - detailCurrentMa10) / detailCurrentMa10) * 100
      : null;
  const detailGap240Pct =
    detailCurrentMa240 && detailCurrentMa240 > 0
      ? ((detailCurrentClose - detailCurrentMa240) / detailCurrentMa240) * 100
      : null;
  const detailVolumeChangePct =
    detailPreviousVolume > 0
      ? ((detailCurrentVolume - detailPreviousVolume) / detailPreviousVolume) * 100
      : null;
  const detailVolumeStatus =
    detailVolumeChangePct === null
      ? "비교 불가"
      : detailCurrentVolume > detailPreviousVolume
        ? "증가"
        : detailCurrentVolume < detailPreviousVolume
          ? "감소"
          : "동일";
  const detailVolumeTone =
    detailVolumeStatus === "증가" ? "positive" : detailVolumeStatus === "감소" ? "negative" : "";
  const detailPreviousRelation10 =
    detailPreviousMa10 === null ? "" : detailPreviousClose <= detailPreviousMa10 ? "이하" : "상회";
  const detailCurrentRelation10 =
    detailCurrentMa10 === null ? "" : detailCurrentClose > detailCurrentMa10 ? "상회" : "이하";
  const detailPreviousRelation240 =
    detailPreviousMa240 === null ? "" : detailPreviousClose <= detailPreviousMa240 ? "이하" : "상회";
  const detailCurrentRelation240 =
    detailCurrentMa240 === null ? "" : detailCurrentClose > detailCurrentMa240 ? "상회" : "이하";
  const isMa10Breakout =
    detailPreviousMa10 !== null &&
    detailCurrentMa10 !== null &&
    detailPreviousClose <= detailPreviousMa10 &&
    detailCurrentClose > detailCurrentMa10;
  const isMa240Breakout =
    detailPreviousMa240 !== null &&
    detailCurrentMa240 !== null &&
    detailPreviousClose <= detailPreviousMa240 &&
    detailCurrentClose > detailCurrentMa240;
  const priceChangePct =
    detailPreviousClose > 0
      ? ((detailCurrentClose - detailPreviousClose) / detailPreviousClose) * 100
      : null;
  const priceDirection =
    detailCurrentClose === detailPreviousClose
      ? "보합"
      : detailCurrentClose > detailPreviousClose
        ? "상승"
        : "하락";
  const priceTone =
    priceChangePct === null || priceChangePct === 0
      ? ""
      : priceChangePct > 0
        ? "positive"
        : "negative";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button className="brand-logo-button" type="button" onClick={() => setLogoOpen(true)} aria-label="선 넘네 로고 크게 보기">
            <img className="brand-logo" src="/brand-mark.png" alt="선 넘네.." />
          </button>
          <div className="brand-copy">
            <p className="eyebrow">KOREA &amp; U.S. MARKETS</p>
            <h1>LINE BREAKER</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="global-stock-search">
            <label>
              <span className="global-search-icon">⌕</span>
              <input
                value={stockQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setStockQuery(value);
                  if (!value.trim()) {
                    setStockMatches([]);
                    setStockSearching(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setStockQuery("");
                    setStockMatches([]);
                  }
                }}
                aria-label="전체 종목 검색"
                autoComplete="off"
                placeholder="종목명·코드·초성 검색 (예: ㅅㅅㅈㅈ)"
              />
              {stockQuery.trim() && stockSearching && <small>검색 중</small>}
            </label>
            {stockQuery.trim() && (
              <div className="global-search-results" role="listbox" aria-label="전체 종목 검색 결과">
                {stockMatches.map((ticker) => (
                  <button
                    key={ticker.code}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      if (scanInProgressRef.current) manualSelectionDuringScanRef.current = true;
                      setDirectTicker(ticker);
                      setStockQuery("");
                      setStockMatches([]);
                    }}
                  >
                    <span>
                      <strong>{ticker.name}</strong>
                      <small>{ticker.code} · {ticker.market} · {ticker.assetType === "STOCK" ? "주식" : ticker.assetType}</small>
                    </span>
                    <em>{ticker.price > 0 ? ticker.currency === "USD" ? formatUsd(ticker.price) : `${formatPrice(ticker.price)}원` : "차트에서 최신가 확인"}</em>
                  </button>
                ))}
                {!stockSearching && !stockMatches.length && <p>일치하는 종목이 없습니다.</p>}
              </div>
            )}
          </div>
          <button className="favorites-entry-button" type="button" onClick={() => setFavoritesOpen(true)}><span aria-hidden="true">★</span> 즐겨찾기</button>
          <button className="league-entry-button" type="button" aria-label="선 넘는 리그 · 데이터 연결됨" onClick={() => { setLeagueTicker(null); setLeagueOpen(true); }}>
            <span>₩</span>
            <strong>선 넘는 리그</strong>
            <i className="league-entry-status" title="데이터 연결됨" aria-hidden="true" />
          </button>
          <div className="account-menu" title={authUser.email}>
            {authUser.picture ? <img src={authUser.picture} alt="" referrerPolicy="no-referrer" /> : <span>{authUser.name.slice(0, 1)}</span>}
            <div><strong>{authUser.name}</strong><small>{authUser.email}</small></div>
            <a href="/api/auth/logout">로그아웃</a>
          </div>
        </div>
      </header>

      <section className="control-deck" aria-label="스크리닝 조건">
        <div className="control-group market-region-control">
          <span className="control-label">국가</span>
          <div className="segmented">
            <button className={region === "kr" ? "active" : ""} onClick={() => { setRegion("kr"); setMarket("all"); setAsset("all"); }}>한국</button>
            <button className={region === "us" ? "active" : ""} onClick={() => { setRegion("us"); setMarket("all"); setAsset("stock"); }}>미국</button>
          </div>
        </div>
        <div className="control-group">
          <span className="control-label">봉</span>
          <div className="segmented">
            {(["weekly", "monthly", "both"] as ScreeningTimeframe[]).map((value) => (
              <button
                key={value}
                className={timeframe === value ? "active" : ""}
                title={value === "both" ? "주봉과 월봉 모두 돌파한 종목" : undefined}
                onClick={() => {
                  setTimeframe(value);
                  if (value !== "both") setChartTimeframe(value);
                }}
              >
                {value === "weekly" ? "주봉" : value === "monthly" ? "월봉" : "주&월"}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span className="control-label">이평</span>
          <div className="segmented">
            {([10, 240, "both"] as ScreeningMaPeriod[]).map((value) => (
              <button
                key={value}
                className={maPeriod === value ? "active" : ""}
                title={value === "both" ? "10이평과 240이평을 모두 돌파한 종목" : undefined}
                onClick={() => setMaPeriod(value)}
              >
                {value === "both" ? "10&240" : value}
              </button>
            ))}
          </div>
        </div>
        {(region === "kr" || asset !== "etp") && <label className="select-field">
          <span>시장</span>
          <select value={market} onChange={(event) => setMarket(event.target.value as MarketFilter)}>
            <option value="all">전체</option>
            {region === "kr" ? <><option value="kospi">KOSPI</option><option value="kosdaq">KOSDAQ</option></> : <><option value="nasdaq">NASDAQ</option><option value="nyse">NYSE</option><option value="amex">AMEX</option></>}
          </select>
        </label>}
        <label className="select-field asset-select">
          <span>종목 유형</span>
          <select value={asset} onChange={(event) => {
            const nextAsset = event.target.value as AssetFilter;
            setAsset(nextAsset);
            if (region === "us" && nextAsset === "etp") setMarket("all");
          }}>
            <option value="all">전체</option>
            <option value="stock">일반주식</option>
            <option value="etp">{region === "us" ? "주요 ETF" : "ETF·ETN"}</option>
          </select>
        </label>
        <div className="scan-action">
          <button className="primary-button" onClick={runFullScan} disabled={scanning}>
            {scanning ? "분석 중…" : "전 종목 새로 스캔"}
          </button>
          {scanning && <button className="quiet-button" onClick={cancelScan}>중단</button>}
        </div>
        <div className="scan-meta">
          <span>{message}</span>
          {scanning && (
            <div className="progress-track" aria-label={`스크리닝 ${progressPct.toFixed(0)}% 완료`}>
              <span style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      </section>

      <section className="summary-strip">
        <article>
          <span>{usesAndFilter ? "AND 돌파 종목" : "포착 신호"}</span>
          <strong>{usesAndFilter ? uniqueStockCount : results.length}</strong>
          <small>{usesAndFilter ? summaryConditionLabel : `${uniqueStockCount}종목`}</small>
        </article>
        <article><span>근접 돌파</span><strong>{nearCount}</strong><small>이격 3% 이하</small></article>
        <article><span>거래량 증가</span><strong>{volumeUpCount}</strong><small>직전 봉 대비</small></article>
        <article><span>분석 실패</span><strong>{progress.failures}</strong><small>최근 실행</small></article>
      </section>

      <section className="workspace">
        <aside className="candidate-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{workspaceTab === "candidates" ? "BREAKOUT LIST" : "MARKET PULSE"}</p>
              <h2>{workspaceTab === "candidates" ? "돌파 후보" : "주요 시장"}</h2>
            </div>
            <span className="count-pill">{workspaceTab === "candidates" ? filtered.length : MARKET_WATCHES.length}</span>
          </div>
          <div className="workspace-tabs" role="tablist" aria-label="주요 지수와 돌파 후보 전환">
            <button type="button" role="tab" aria-selected={workspaceTab === "markets"} className={workspaceTab === "markets" ? "active" : ""} onClick={() => setWorkspaceTab("markets")}>주요 지수</button>
            <button type="button" role="tab" aria-selected={workspaceTab === "candidates"} className={workspaceTab === "candidates" ? "active" : ""} disabled={!hasScreenResults} onClick={() => setWorkspaceTab("candidates")}>돌파 후보{hasScreenResults ? ` ${filtered.length}` : ""}</button>
          </div>
          {workspaceTab === "candidates" && hasScreenResults ? <>
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명 또는 코드" />
          </label>
          {(classificationFilters.length > 0 || statusFilter !== "all" || volumeFilter !== "all") && (
            <div className="classification-filter">
              <span>선택</span>
              <div>
                {statusFilter !== "all" && (
                  <button
                    type="button"
                    className={`classification-filter-chip signal ${statusFilter === "상승 진행" ? "rising" : statusFilter === "추격 주의" ? "caution" : "near"}`}
                    onClick={() => setStatusFilter("all")}
                  >
                    {statusFilter} <b>×</b>
                  </button>
                )}
                {volumeFilter !== "all" && (
                  <button
                    type="button"
                    className={`classification-filter-chip volume ${volumeFilter === "증가" ? "up" : "down"}`}
                    onClick={() => setVolumeFilter("all")}
                  >
                    거래량 {volumeFilter} <b>×</b>
                  </button>
                )}
                {classificationFilters.map((filter) => (
                  <button
                    key={`${filter.kind}:${filter.value}`}
                    type="button"
                    className={`classification-filter-chip ${filter.kind}${filter.kind === "market" ? ` ${filter.value.toLowerCase()}` : ""}`}
                    onClick={() => toggleClassificationFilter(filter)}
                  >
                    {filter.value} <b>×</b>
                  </button>
                ))}
                <button className="clear-all" type="button" onClick={() => {
                  setClassificationFilters([]);
                  setStatusFilter("all");
                  setVolumeFilter("all");
                }}>전체 해제</button>
              </div>
            </div>
          )}
          <div className="candidate-list">
            {filtered.map((item, index) => (
              <button
                key={candidateKey(item)}
                className={`candidate-row ${!directTicker && selectedCandidate && candidateKey(selectedCandidate) === candidateKey(item) ? "selected" : ""}`}
                onClick={() => {
                  if (scanInProgressRef.current) manualSelectionDuringScanRef.current = true;
                  setDirectTicker(null);
                  setSelectedKey(candidateKey(item));
                  if (!item.matchedTimeframes?.length) setChartTimeframe(item.timeframe);
                }}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="candidate-main">
                  <span className="candidate-title-line">
                    <strong>{item.name}</strong>
                    {(item.matchedTimeframes?.length === 2 || item.matchedMaPeriods?.length === 2) && (
                      <em className="intersection-chip">
                        {item.matchedTimeframes?.length === 2 && item.matchedMaPeriods?.length === 2
                          ? "주·월 × 10·240"
                          : item.matchedTimeframes?.length === 2
                            ? "주·월 AND"
                            : "10·240 AND"}
                      </em>
                    )}
                    <span
                      className={`signal-chip${statusFilter === item.status ? " active" : ""}`}
                      data-status={item.status}
                      role="button"
                      tabIndex={0}
                      title={`${item.status} 종목만 보기`}
                      onClick={(event) => { event.stopPropagation(); setStatusFilter((current) => current === item.status ? "all" : item.status); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setStatusFilter((current) => current === item.status ? "all" : item.status); } }}
                    >{item.status}</span>
                    {item.isNasdaq100 && <em className="ndx-chip">NASDAQ 100</em>}
                  </span>
                  <span className="candidate-classification" aria-label={`${item.name} 섹터와 테마`}>
                    <span
                      className={`candidate-market-tag ${item.market.toLowerCase()}${hasClassificationFilter("market", item.market) ? " active" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => { event.stopPropagation(); toggleClassificationFilter({ kind: "market", value: item.market }); }}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleClassificationFilter({ kind: "market", value: item.market }); } }}
                    >{item.market}</span>
                    {item.sector ? (
                      <span
                        className={`candidate-sector-tag${hasClassificationFilter("sector", item.sector) ? " active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { event.stopPropagation(); toggleClassificationFilter({ kind: "sector", value: item.sector! }); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleClassificationFilter({ kind: "sector", value: item.sector! }); } }}
                      >{item.sector}</span>
                    ) : <span className="candidate-sector-tag pending">섹터 확인 중</span>}
                    {item.themes?.slice(0, 2).map((theme) => (
                      <span
                        key={theme}
                        className={`candidate-theme-tag${hasClassificationFilter("theme", theme) ? " active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { event.stopPropagation(); toggleClassificationFilter({ kind: "theme", value: theme }); }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleClassificationFilter({ kind: "theme", value: theme }); } }}
                      >{theme}</span>
                    ))}
                  </span>
                </span>
                <span className="candidate-metric">
                  <strong>{item.currency === "USD" ? formatUsd(latestPrices[item.code] ?? item.price ?? item.close) : `${formatPrice(latestPrices[item.code] ?? item.price ?? item.close)}원`}</strong>
                  {item.currency === "USD" && item.exchangeRate && <small className="krw-conversion">약 {formatPrice((latestPrices[item.code] ?? item.price ?? item.close) * item.exchangeRate)}원</small>}
                  <small className={item.gapPct < 0 ? "down" : "up"}>
                    이격{item.matchedTimeframes?.length === 2 ? "(주)" : ""} {signed(item.gapPct, 2)}
                  </small>
                  <small
                    className={`candidate-volume-filter ${item.volumeStatus === "감소" ? "down" : "up"}${volumeFilter === item.volumeStatus ? " active" : ""}`}
                    role="button"
                    tabIndex={0}
                    title={`거래량 ${item.volumeStatus} 종목만 보기`}
                    onClick={(event) => { event.stopPropagation(); setVolumeFilter((current) => current === item.volumeStatus ? "all" : item.volumeStatus); }}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setVolumeFilter((current) => current === item.volumeStatus ? "all" : item.volumeStatus); } }}
                  >
                    거래량 {signed(item.volumeChangePct)}
                  </small>
                </span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">조건에 맞는 후보가 없습니다.</div>}
          </div>
          </> : (
            <div className="market-watch-list" aria-label="주요 시장 빠른 선택">
              <p>주요 지수의 흐름을 확인하고, 필요하면 돌파 후보 탭으로 전환하세요.</p>
              {[
                ["korea", "국내 시장"],
                ["global-index", "글로벌 주요 지수"],
                ["global-indicator", "글로벌 지표"],
              ].map(([group, label]) => {
                const watches = MARKET_WATCHES.filter((watch) => watch.group === group);
                return <div key={group} className="market-watch-group"><strong>{label}</strong>{watches.map((watch) => (
                  <button
                    key={watch.id}
                    type="button"
                    className={watch.id === activeMarketWatch.id ? "active" : ""}
                    onClick={() => openMarketOverview(watch.id)}
                  >
                    <span>{watch.name}</span>
                    <small>{watch.shortName}</small>
                  </button>
                ))}</div>;
              })}
            </div>
          )}
        </aside>

        <section ref={chartPanelRef} className="chart-panel">
          {selected ? (
            <>
              <div className="security-header">
                  <div>
                    <div className="security-title">
                    {isMarketOverview ? (
                      <h2>{selected.name}</h2>
                    ) : (
                    <a
                      className="security-stock-link"
                      href={naverStockPageUrl(selected)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${selected.name} 종목 페이지 열기`}
                    >
                      <h2>{selected.name}</h2>
                    </a>
                    )}
                    <span>{isMarketOverview ? "MARKET OVERVIEW" : selected.code}</span>
                    <span className={`market-tag ${selected.market.toLowerCase()}`}>{selected.market}</span>
                    <span className={`asset-tag ${selected.assetType.toLowerCase()}`}>
                      {isMarketOverview ? "주요 지수" : selected.assetType === "STOCK" ? "주식" : selected.assetType}
                    </span>
                    {(selected.isNasdaq100 ?? indexMembership) && <span className="ndx-header-tag">NASDAQ 100</span>}
                    {!isMarketOverview && activeClassification?.sector && <span className="sector-tag">{activeClassification.sector}</span>}
                    {!isMarketOverview && activeClassification?.themes?.map((theme) => <span className="theme-tag" key={theme}>{theme}</span>)}
                    {directTicker && <span className="direct-view-tag">직접 조회</span>}
                  </div>
                  <p>
                    {chartTimeframeLabel} · {isMarketOverview ? "시장 흐름" : `MA10 ${isMa10Breakout ? "상향돌파" : detailCurrentRelation10 || "계산 중"} · MA240 ${isMa240Breakout ? "상향돌파" : detailCurrentRelation240 || "계산 중"}`}
                  </p>
                  <div className="security-quick-actions">
                    {!isMarketOverview && <>
                      <button
                        className={`favorite-security-button${selectedIsFavorite ? " saved" : ""}`}
                        type="button"
                        aria-pressed={selectedIsFavorite}
                        aria-label={selectedIsFavorite ? `${selected.name} 즐겨찾기 관리, 저장됨` : `${selected.name} 즐겨찾기에 추가`}
                        onClick={() => setFavoritesOpen(true)}
                      >
                        <span aria-hidden="true">{selectedIsFavorite ? "★" : "☆"}</span>
                        {selectedIsFavorite ? "즐겨찾기됨" : "즐겨찾기"}
                      </button>
                      {supportsPaperTrading(selected) && <button
                        className="simulated-trade-button"
                        type="button"
                        onClick={() => {
                          setLeagueTicker({
                            ...selected,
                            price: detailCurrentClose,
                            exchangeRate: appliedExchangeRate ?? undefined,
                          });
                          setLeagueOpen(true);
                        }}
                      >
                        <span>₩</span> 모의투자
                      </button>}
                      <button
                        className="stock-analysis-button"
                        type="button"
                        onClick={() => setAnalysisTicker({ ...selected, price: detailCurrentClose, exchangeRate: appliedExchangeRate ?? undefined })}
                      >
                        <span>AI</span> 심층분석
                      </button>
                    </>}
                    {isMarketOverview && <button
                      className="stock-analysis-button"
                      type="button"
                      onClick={() => {
                        setLeagueTicker({ ...selected, price: detailCurrentClose, exchangeRate: appliedExchangeRate ?? undefined });
                        setLeagueOpen(true);
                      }}
                    >
                      <span>✎</span> 리그 노트
                    </button>}
                    </div>
                </div>
                <div className="security-price">
                  <small>현재가</small>
                  <div>
                    <strong>{isMarketOverview ? formatMarketWatchPrice(detailCurrentClose, activeMarketWatch.unit) : isUsdSecurity ? formatUsd(detailCurrentClose) : formatPrice(detailCurrentClose)}</strong>
                    {!(isUsdSecurity || (isMarketOverview && (activeMarketWatch.unit === "USD" || activeMarketWatch.unit === "%"))) && <span>{priceUnit}</span>}
                  </div>
                  {isUsdSecurity && appliedExchangeRate && <small className="krw-current-price">약 {formatPrice(detailCurrentClose * appliedExchangeRate)}원 <em>USD/KRW {appliedExchangeRate.toFixed(2)}</em></small>}
                  <small className="current-price-change" aria-label="기간별 현재가 변동">
                    {(["daily", "weekly", "monthly"] as PriceChangePeriod[]).map((period) => {
                      const change = priceChanges[period];
                      const label = period === "daily" ? "전일" : period === "weekly" ? "전주" : "전월";
                      const tone = !change || change.changePct === 0 ? "" : change.changePct > 0 ? "positive" : "negative";
                      return (
                        <span
                          key={period}
                          className={`price-change-item ${tone}`}
                          title={change ? `${label} 대비 ${isUsdSecurity ? formatUsd(change.change) : `${signedPrice(change.change)}원`} · ${signed(change.changePct, 2)}` : `${label} 대비 계산 중`}
                        >
                          {label} <b>{change ? signed(change.changePct, 2) : "—"}</b>
                        </span>
                      );
                    })}
                  </small>
                </div>
              </div>

              <div className="metric-grid">
                <article><span>{isMarketOverview ? "시장 지표" : "시가총액"}</span><strong>{isMarketOverview ? activeMarketWatch.shortName : formatCap(selected.marketCap)}</strong></article>
                <article className="ma-metric">
                  <span>MA10 · 10{chartMaUnit}선</span>
                  <strong>{formatMaybePrice(detailCurrentMa10)}</strong>
                  <small className={detailGap10Pct !== null && detailGap10Pct < 0 ? "negative" : "positive"}>이격 {signed(detailGap10Pct, 2)}</small>
                </article>
                <article className="ma-metric">
                  <span>MA240 · 240{chartMaUnit}선</span>
                  <strong>{formatMaybePrice(detailCurrentMa240)}</strong>
                  <small className={detailGap240Pct !== null && detailGap240Pct < 0 ? "negative" : "positive"}>이격 {signed(detailGap240Pct, 2)}</small>
                </article>
                <article><span>거래량 변화</span><strong className={detailVolumeTone}>{detailVolumeStatus} {signed(detailVolumeChangePct)}</strong></article>
              </div>

              <div className="chart-card">
                <div className="chart-toolbar">
                  <div className="chart-legend">
                    <span><i className="legend-candle" /> 캔들</span>
                    <span><i className="legend-ma5" /> MA 5</span>
                    <span className="legend-key"><i className="legend-ma10" /> MA 10</span>
                    <span className="legend-key"><i className="legend-ma240" /> MA 240</span>
                    <span><i className="legend-volume" /> 거래량</span>
                  </div>
                  <div className="chart-toolbar-actions">
                    <div className="chart-period-buttons" aria-label="차트 기간">
                      {(["daily", "weekly", "monthly"] as ChartTimeframe[]).map((value) => (
                        <button
                          key={value}
                          className={chartTimeframe === value ? "active" : ""}
                          onClick={() => setChartTimeframe(value)}
                        >
                          {value === "daily" ? "일봉 보기" : value === "weekly" ? "주봉 보기" : "월봉 보기"}
                        </button>
                      ))}
                    </div>
                    <div className="chart-drawing-actions" aria-label="차트 도구">
                      <button
                        type="button"
                        className={trendLineMode ? "active" : ""}
                        aria-pressed={trendLineMode}
                        onClick={() => { setTrendLineMode((current) => !current); setChartCopyStatus("idle"); }}
                      >
                        <span aria-hidden="true">╱</span> {trendLineMode ? "추세선 종료" : "추세선"}
                      </button>
                      <button type="button" onClick={() => chartCanvasRef.current?.undoTrendLine()} title="마지막 추세선 취소">↶</button>
                      <button type="button" onClick={() => chartCanvasRef.current?.clearTrendLines()} title="추세선 전체 삭제">지우기</button>
                      <button
                        type="button"
                        onClick={() => {
                          void chartCanvasRef.current?.copyImage().then((copied) => {
                            setChartCopyStatus(copied ? "copied" : "unsupported");
                            window.setTimeout(() => setChartCopyStatus("idle"), 2200);
                          });
                        }}
                      >
                        {chartCopyStatus === "copied" ? "복사됨" : chartCopyStatus === "unsupported" ? "복사 불가" : "이미지 복사"}
                      </button>
                    </div>
                    <div className="chart-range-control">
                      <span className="range-side-label">좁게</span>
                      <input
                        type="range"
            min={CHART_RANGE_MIN}
            max={CHART_RANGE_MAX}
                        step={CHART_RANGE_STEP}
                        value={range}
                        aria-label="차트 표시 봉 수"
            style={{ background: `linear-gradient(90deg, var(--green) ${((range - CHART_RANGE_MIN) / (CHART_RANGE_MAX - CHART_RANGE_MIN)) * 100}%, #dfe2dc ${((range - CHART_RANGE_MIN) / (CHART_RANGE_MAX - CHART_RANGE_MIN)) * 100}% 100%)` }}
                        onChange={(event) => setRange(Number(event.target.value))}
                      />
                      <span className="range-side-label">넓게</span>
                    </div>
                  </div>
                </div>
                {trendLineMode && !chartLoading && <p className="chart-drawing-guide">시작점을 찍고 단일 클릭으로 선을 이어 그리세요. 마지막 지점을 더블클릭하거나 ‘추세선 종료’를 눌러 완료합니다.</p>}
                {chartLoading ? <div className="chart-loading">차트를 불러오는 중…</div> : <ChartCanvas ref={chartCanvasRef} points={chart} range={range} onRangeChange={setRange} trendLineMode={trendLineMode} trendLineStorageKey={trendLineStorageKey} exportTitle={`${selected.name} · ${chartTimeframeLabel}`} />}
              </div>

              <div className="evidence-grid">
                <article className="evidence-card">
                  <div className="step-number">01</div>
                  <div>
                    <span>직전 봉</span>
                    <strong>{formatPrice(detailPreviousClose)}{priceUnit}</strong>
                    <small className="ma-evidence ma10">MA10 {formatMaybePrice(detailPreviousMa10)}{priceUnit} {detailPreviousRelation10}</small>
                    <small className="ma-evidence ma240">MA240 {formatMaybePrice(detailPreviousMa240)}{priceUnit} {detailPreviousRelation240}</small>
                  </div>
                </article>
                <div className="flow-arrow">→</div>
                <article className="evidence-card current">
                  <div className="step-number">02</div>
                  <div>
                    <span>현재 봉</span>
                    <strong>{formatPrice(detailCurrentClose)}{priceUnit}</strong>
                    <small className="ma-evidence ma10">MA10 {formatMaybePrice(detailCurrentMa10)}{priceUnit} {detailCurrentRelation10}</small>
                    <small className="ma-evidence ma240">MA240 {formatMaybePrice(detailCurrentMa240)}{priceUnit} {detailCurrentRelation240}</small>
                    <small className={`price-change ${priceTone}`}>
                      직전 봉 대비 {priceDirection} {signed(priceChangePct, 2)}
                    </small>
                  </div>
                </article>
                <article className="volume-card">
                  <span>거래량 비교</span>
                  <div><strong>{formatVolume(detailPreviousVolume)}</strong><em>→</em><strong>{formatVolume(detailCurrentVolume)}</strong></div>
                  <small className={detailVolumeTone}>{detailVolumeStatus} {signed(detailVolumeChangePct)}</small>
                </article>
              </div>

              <SecurityResearchNotes key={`${selected.market}:${selected.code}`} ticker={selected} />
            </>
          ) : (
            <div className="chart-empty">스크리닝을 실행해 차트 후보를 불러오세요.</div>
          )}
        </section>
      </section>

      {logoOpen && (
        <div className="logo-lightbox" role="dialog" aria-modal="true" aria-label="선 넘네 로고">
          <div className="logo-lightbox-card">
            <button className="logo-lightbox-close" type="button" onClick={() => setLogoOpen(false)} aria-label="로고 크게 보기 닫기">×</button>
            <img src="/brand-mark.png" alt="선 넘네.. 로고" />
            <a href="mailto:minkyuman@gmail.com">minkyuman@gmail.com</a>
          </div>
        </div>
      )}

      {leagueOpen && <LeagueDialog onClose={closeLeague} onOpenChart={openSavedSecurityChart} onCaptureChart={async () => chartCanvasRef.current?.captureImage() ?? null} ticker={activeLeagueTicker} />}
      {favoritesOpen && <FavoriteDialog currentTicker={isMarketOverview ? null : { ...selected, price: detailCurrentClose, exchangeRate: appliedExchangeRate ?? undefined }} initialLists={favoriteLists} onClose={closeFavorites} onOpenChart={openSavedSecurityChart} onListsChange={setFavoriteLists} />}
      {analysisTicker && <StockAnalysisDialog ticker={analysisTicker} onClose={() => setAnalysisTicker(null)} />}

      <footer>
        <p>현재 봉은 진행 중이므로 신호와 거래량 비교는 마감 전까지 달라질 수 있습니다.</p>
        <p>데이터는 공개 시장 정보를 기반으로 하며 투자 판단을 보장하지 않습니다.</p>
      </footer>
    </main>
  );
}
