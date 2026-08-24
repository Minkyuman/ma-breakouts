"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Timeframe,
} from "@/lib/market";

const INITIAL_RESULTS: Candidate[] = [
  {
    code: "300720", name: "한일시멘트", market: "KOSPI", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 1_100_000_000_000,
    price: 15350, date: "2026-08-21", previousClose: 14900, previousMa: 15005,
    close: 15350, ma: 14981, gapPct: 2.46, previousVolume: 299691, volume: 398869,
    volumeChangePct: 33.1, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "330350", name: "위더스제약", market: "KOSDAQ", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 115_600_000_000,
    price: 8760, date: "2026-08-21", previousClose: 7560, previousMa: 8038,
    close: 8760, ma: 8021, gapPct: 9.22, previousVolume: 388800, volume: 1381636,
    volumeChangePct: 255.4, volumeStatus: "증가", status: "추격 주의",
  },
  {
    code: "006660", name: "삼성공조", market: "KOSPI", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 112_500_000_000,
    price: 13850, date: "2026-08-21", previousClose: 11630, previousMa: 12018,
    close: 13850, ma: 12004, gapPct: 15.37, previousVolume: 1220627, volume: 15447139,
    volumeChangePct: 1165.5, volumeStatus: "증가", status: "추격 주의",
  },
  {
    code: "217190", name: "제너셈", market: "KOSDAQ", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 83_400_000_000,
    price: 6340, date: "2026-08-21", previousClose: 6000, previousMa: 6103,
    close: 6340, ma: 6104, gapPct: 3.87, previousVolume: 713594, volume: 2888758,
    volumeChangePct: 304.8, volumeStatus: "증가", status: "상승 진행",
  },
  {
    code: "070300", name: "퀀텀레일", market: "KOSDAQ", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 72_800_000_000,
    price: 2050, date: "2026-08-21", previousClose: 1738, previousMa: 2046,
    close: 2050, ma: 2044, gapPct: 0.29, previousVolume: 1525956, volume: 5693200,
    volumeChangePct: 273.1, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "000950", name: "전방", market: "KOSPI", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 57_000_000_000,
    price: 33900, date: "2026-08-21", previousClose: 31900, previousMa: 33258,
    close: 33900, ma: 33233, gapPct: 2.01, previousVolume: 8041, volume: 23355,
    volumeChangePct: 190.4, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "134060", name: "이퓨쳐", market: "KOSDAQ", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 25_900_000_000,
    price: 5430, date: "2026-08-21", previousClose: 4960, previousMa: 5279,
    close: 5430, ma: 5267, gapPct: 3.09, previousVolume: 29940, volume: 29717,
    volumeChangePct: -0.7, volumeStatus: "감소", status: "상승 진행",
  },
  {
    code: "001515", name: "SK증권우", market: "KOSPI", assetType: "STOCK", timeframe: "weekly", maPeriod: 240, marketCap: 10_200_000_000,
    price: 5230, date: "2026-08-21", previousClose: 4260, previousMa: 5163,
    close: 5230, ma: 5152, gapPct: 1.51, previousVolume: 18977, volume: 204441,
    volumeChangePct: 977.3, volumeStatus: "증가", status: "근접 돌파",
  },
];

type MarketWatch = {
  id: string;
  name: string;
  shortName: string;
  unit: "pt" | "원";
};

const MARKET_WATCHES: MarketWatch[] = [
  { id: "kospi", name: "코스피", shortName: "KOSPI", unit: "pt" },
  { id: "kosdaq", name: "코스닥", shortName: "KOSDAQ", unit: "pt" },
  { id: "sp500", name: "S&P 500", shortName: "S&P 500", unit: "pt" },
  { id: "nasdaq100", name: "나스닥 100", shortName: "NASDAQ 100", unit: "pt" },
  { id: "nasdaq", name: "나스닥 종합", shortName: "NASDAQ", unit: "pt" },
  { id: "dow", name: "다우존스", shortName: "DOW", unit: "pt" },
  { id: "russell", name: "러셀 2000", shortName: "RUSSELL 2000", unit: "pt" },
  { id: "sox", name: "필라델피아 반도체", shortName: "SOX", unit: "pt" },
  { id: "usdkrw", name: "달러 / 원", shortName: "USD/KRW", unit: "원" },
  { id: "vix", name: "VIX 변동성 지수", shortName: "VIX", unit: "pt" },
];

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

function formatPrice(value: number) {
  return number.format(Math.round(value));
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
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

function signed(value: number | null, digits = 1) {
  if (value === null) return "비교 불가";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function signedPrice(value: number) {
  return `${value >= 0 ? "+" : "−"}${formatPrice(Math.abs(value))}`;
}

type PriceChangeSummary = {
  current: number;
  previous: number;
  change: number;
  changePct: number;
};

type PriceChangePeriod = "daily" | "weekly" | "monthly";
type PriceChangeSet = Record<PriceChangePeriod, PriceChangeSummary | null>;
type ClassificationFilter = { kind: "market" | "sector" | "theme"; value: string };

const EMPTY_PRICE_CHANGES: PriceChangeSet = { daily: null, weekly: null, monthly: null };
const CHART_RANGE_MIN = 10;
const CHART_RANGE_MAX = 360;
const CHART_RANGE_STEP = 5;

function candidateKey(item: Pick<Candidate, "code" | "timeframe" | "maPeriod">) {
  return `${item.code}:${item.timeframe}:${item.maPeriod}`;
}

function compareCandidates(a: Candidate, b: Candidate) {
  return b.marketCap - a.marketCap || a.code.localeCompare(b.code) || a.timeframe.localeCompare(b.timeframe);
}

function ChartCanvas({
  points,
  range,
  onRangeChange,
}: {
  points: ChartPoint[];
  range: number;
  onRangeChange: (range: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; start: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; range: number } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ y: number; price: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ y: number; price: number } | null>(null);
  const [panStart, setPanStart] = useState(0);
  const [dragging, setDragging] = useState(false);
  const maxPanStart = Math.max(0, points.length - range);
  const visible = useMemo(() => points.slice(panStart, panStart + range), [points, panStart, range]);
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
    setPanStart(maxPanStart);
  }, [maxPanStart]);

  useEffect(() => {
    setSelectedIndex(null);
    setSelectedPoint(null);
  }, [points, range]);

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
  }, [visible, focusedIndex, focusedPoint]);

  return (
    <div className="chart-wrap">
      <canvas
        ref={canvasRef}
        className={`chart-canvas${dragging ? " is-dragging" : ""}`}
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
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: panStart };
          }
          setDragging(true);
          setHoverIndex(null);
          setHoverPoint(null);
        }}
        onPointerUp={(event) => {
          const dragStart = dragRef.current;
          const wasPinching = pinchRef.current !== null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          pointersRef.current.delete(event.pointerId);
          dragRef.current = null;
          const remainingPointers = [...pointersRef.current.entries()];
          if (remainingPointers.length === 1) {
            const [pointerId, pointer] = remainingPointers[0];
            pinchRef.current = null;
            dragRef.current = { pointerId, x: pointer.x, y: pointer.y, start: panStart };
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
            setPanStart(Math.max(0, Math.min(maxPanStart, dragRef.current.start - deltaBars)));
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
}

export default function Home() {
  const [region, setRegion] = useState<Region>("kr");
  const [timeframe, setTimeframe] = useState<ScreeningTimeframe>("weekly");
  const [maPeriod, setMaPeriod] = useState<ScreeningMaPeriod>(240);
  const [market, setMarket] = useState<MarketFilter>("all");
  const [asset, setAsset] = useState<AssetFilter>("all");
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("weekly");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [marketWatchId, setMarketWatchId] = useState("kospi");
  const [directTicker, setDirectTicker] = useState<Ticker | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [stockMatches, setStockMatches] = useState<Ticker[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [volumeFilter, setVolumeFilter] = useState("all");
  const [classificationFilters, setClassificationFilters] = useState<ClassificationFilter[]>([]);
  const [range, setRange] = useState(80);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChangeSet>(EMPTY_PRICE_CHANGES);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [indexMembership, setIndexMembership] = useState<boolean | null>(null);
  const [classification, setClassification] = useState<SecurityClassification | null>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [chartLoading, setChartLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failures: 0 });
  const [message, setMessage] = useState("스캔 전 · 주요 시장 흐름을 확인하세요");

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
  const scanToken = useRef(0);

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

  const selectedCandidate = results.find((item) => candidateKey(item) === selectedKey) ?? filtered[0] ?? results[0];
  const activeMarketWatch = MARKET_WATCHES.find((item) => item.id === marketWatchId) ?? MARKET_WATCHES[0];
  const isMarketOverview = !directTicker && !selectedCandidate;
  const marketTicker: Ticker = {
    code: "MARKET",
    name: activeMarketWatch.name,
    market: "KOSPI",
    assetType: "STOCK",
    marketCap: 0,
    price: 0,
  };
  const selected = directTicker ?? selectedCandidate ?? marketTicker;
  const selectedSignal = directTicker || isMarketOverview ? undefined : selectedCandidate;
  const activeClassification = classification ?? (selected.sector ? { sector: selected.sector, industry: selected.industry, themes: selected.themes } : null);

  useEffect(() => {
    const normalized = stockQuery.trim();
    if (!normalized) {
      setStockMatches([]);
      setStockSearching(false);
      return;
    }
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

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setChartLoading(true);
    setChart([]);
    setPriceChanges(EMPTY_PRICE_CHANGES);
    setIndexMembership(null);
    setClassification(null);
    const endpoint = isMarketOverview
      ? `/api/market-chart?id=${encodeURIComponent(activeMarketWatch.id)}&timeframe=${chartTimeframe}`
      : `/api/chart?code=${selected.code}&name=${encodeURIComponent(selected.name)}&market=${selected.market}&timeframe=${chartTimeframe}`;
    fetch(endpoint, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("차트를 불러오지 못했습니다.");
        return response.json() as Promise<{ points: ChartPoint[]; changes?: PriceChangeSet; exchangeRate?: number; isNasdaq100?: boolean; classification?: SecurityClassification }>;
      })
      .then((payload) => {
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
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChartLoading(false);
      });
    return () => controller.abort();
  }, [selected?.code, chartTimeframe, isMarketOverview, activeMarketWatch.id]);

  async function runFullScan() {
    const token = ++scanToken.current;
    setDirectTicker(null);
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
      setMessage(`${tickers.length.toLocaleString("ko-KR")}종목 · ${timeframeLabel} · ${maLabel} 분석 중${region === "us" ? " · 거래소별 시총 상위 1,000 보통주" : ""}`);
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
      if (sorted[0]) setSelectedKey(candidateKey(sorted[0]));
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
      if (scanToken.current === token) setScanning(false);
    }
  }

  function cancelScan() {
    scanToken.current += 1;
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
            <p className="eyebrow">KOREA MARKET</p>
            <h1>MA BREAKOUTS</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="global-stock-search">
            <label>
              <span className="global-search-icon">⌕</span>
              <input
                value={stockQuery}
                onChange={(event) => setStockQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setStockQuery("");
                    setStockMatches([]);
                  }
                }}
                aria-label="전체 종목 검색"
                autoComplete="off"
                placeholder="전체 종목명 또는 코드 검색"
              />
              {stockSearching && <small>검색 중</small>}
            </label>
            {stockQuery.trim() && (
              <div className="global-search-results" role="listbox" aria-label="전체 종목 검색 결과">
                {stockMatches.map((ticker) => (
                  <button
                    key={ticker.code}
                    type="button"
                    role="option"
                    onClick={() => {
                      setDirectTicker(ticker);
                      setStockQuery("");
                      setStockMatches([]);
                    }}
                  >
                    <span>
                      <strong>{ticker.name}</strong>
                      <small>{ticker.code} · {ticker.market} · {ticker.assetType === "STOCK" ? "주식" : ticker.assetType}</small>
                    </span>
                    <em>{ticker.currency === "USD" ? formatUsd(ticker.price) : `${formatPrice(ticker.price)}원`}</em>
                  </button>
                ))}
                {!stockSearching && !stockMatches.length && <p>일치하는 종목이 없습니다.</p>}
              </div>
            )}
          </div>
          <div className="market-clock">
            <span className="live-dot" />
            <span>실시간 데이터 연결</span>
            <span className="clock-separator">KST</span>
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
        <label className="select-field">
          <span>시장</span>
          <select value={market} onChange={(event) => setMarket(event.target.value as MarketFilter)}>
            <option value="all">전체</option>
            {region === "kr" ? <><option value="kospi">KOSPI</option><option value="kosdaq">KOSDAQ</option></> : <><option value="nasdaq">NASDAQ</option><option value="nyse">NYSE</option><option value="amex">AMEX</option></>}
          </select>
        </label>
        {region === "kr" && <label className="select-field asset-select">
          <span>종목 유형</span>
          <select value={asset} onChange={(event) => setAsset(event.target.value as AssetFilter)}>
            <option value="all">전체</option>
            <option value="stock">일반주식</option>
            <option value="etp">ETF·ETN</option>
          </select>
        </label>}
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
              <p className="eyebrow">{hasScreenResults ? "BREAKOUT LIST" : "MARKET PULSE"}</p>
              <h2>{hasScreenResults ? "돌파 후보" : "주요 시장"}</h2>
            </div>
            <span className="count-pill">{hasScreenResults ? filtered.length : MARKET_WATCHES.length}</span>
          </div>
          {hasScreenResults ? <>
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명 또는 코드" />
          </label>
          <div className="filter-row">
            <select aria-label="돌파 상태" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">모든 상태</option>
              <option value="근접 돌파">근접 돌파</option>
              <option value="상승 진행">상승 진행</option>
              <option value="추격 주의">추격 주의</option>
            </select>
            <select aria-label="거래량 상태" value={volumeFilter} onChange={(event) => setVolumeFilter(event.target.value)}>
              <option value="all">거래량 전체</option>
              <option value="증가">거래량 증가</option>
              <option value="감소">거래량 감소</option>
            </select>
          </div>
          {classificationFilters.length > 0 && (
            <div className="classification-filter">
              <span>선택</span>
              <div>
                {classificationFilters.map((filter) => (
                  <button key={`${filter.kind}:${filter.value}`} type="button" onClick={() => toggleClassificationFilter(filter)}>
                    {filter.value} <b>×</b>
                  </button>
                ))}
                <button className="clear-all" type="button" onClick={() => setClassificationFilters([])}>전체 해제</button>
              </div>
            </div>
          )}
          <div className="candidate-list">
            {filtered.map((item, index) => (
              <button
                key={candidateKey(item)}
                className={`candidate-row ${!directTicker && selectedCandidate && candidateKey(selectedCandidate) === candidateKey(item) ? "selected" : ""}`}
                onClick={() => {
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
                    <em className="signal-chip" data-status={item.status}>{item.status}</em>
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
                  <small className={item.volumeStatus === "감소" ? "down" : "up"}>
                    거래량 {signed(item.volumeChangePct)}
                  </small>
                </span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">조건에 맞는 후보가 없습니다.</div>}
          </div>
          </> : (
            <div className="market-watch-list" aria-label="주요 시장 빠른 선택">
              <p>스크리닝 전에는 주요 시장 흐름을 먼저 확인하세요.</p>
              {MARKET_WATCHES.map((watch) => (
                <button
                  key={watch.id}
                  type="button"
                  className={watch.id === activeMarketWatch.id ? "active" : ""}
                  onClick={() => setMarketWatchId(watch.id)}
                >
                  <span>{watch.name}</span>
                  <small>{watch.shortName}</small>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="chart-panel">
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
                      href={selected.currency === "USD" ? `https://finance.yahoo.com/quote/${encodeURIComponent(selected.code)}` : `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(selected.code)}`}
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
                </div>
                <div className="security-price">
                  <small>현재가</small>
                  <div>
                    <strong>{isUsdSecurity ? formatUsd(detailCurrentClose) : formatPrice(detailCurrentClose)}</strong>
                    {!isUsdSecurity && <span>{priceUnit}</span>}
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
                {chartLoading ? <div className="chart-loading">차트를 불러오는 중…</div> : <ChartCanvas points={chart} range={range} onRangeChange={setRange} />}
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
            </>
          ) : (
            <div className="chart-empty">스크리닝을 실행해 차트 후보를 불러오세요.</div>
          )}
        </section>
      </section>

      {logoOpen && (
        <div className="logo-lightbox" role="dialog" aria-modal="true" aria-label="선 넘네 로고" onClick={() => setLogoOpen(false)}>
          <div className="logo-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <button className="logo-lightbox-close" type="button" onClick={() => setLogoOpen(false)} aria-label="로고 크게 보기 닫기">×</button>
            <img src="/brand-mark.png" alt="선 넘네.. 로고" />
            <a href="mailto:minkyuman@gmail.com">minkyuman@gmail.com</a>
          </div>
        </div>
      )}

      <footer>
        <p>현재 봉은 진행 중이므로 신호와 거래량 비교는 마감 전까지 달라질 수 있습니다.</p>
        <p>데이터는 공개 시장 정보를 기반으로 하며 투자 판단을 보장하지 않습니다.</p>
      </footer>
    </main>
  );
}
