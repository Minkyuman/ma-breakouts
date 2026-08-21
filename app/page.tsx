"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, ChartPoint, MarketFilter, Ticker, Timeframe } from "@/lib/market";

const INITIAL_RESULTS: Candidate[] = [
  {
    code: "300720", name: "한일시멘트", market: "KOSPI", marketCap: 1_100_000_000_000,
    price: 15350, date: "2026-08-21", previousClose: 14900, previousMa: 15005,
    close: 15350, ma: 14981, gapPct: 2.46, previousVolume: 299691, volume: 398869,
    volumeChangePct: 33.1, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "330350", name: "위더스제약", market: "KOSDAQ", marketCap: 115_600_000_000,
    price: 8760, date: "2026-08-21", previousClose: 7560, previousMa: 8038,
    close: 8760, ma: 8021, gapPct: 9.22, previousVolume: 388800, volume: 1381636,
    volumeChangePct: 255.4, volumeStatus: "증가", status: "추격 주의",
  },
  {
    code: "006660", name: "삼성공조", market: "KOSPI", marketCap: 112_500_000_000,
    price: 13850, date: "2026-08-21", previousClose: 11630, previousMa: 12018,
    close: 13850, ma: 12004, gapPct: 15.37, previousVolume: 1220627, volume: 15447139,
    volumeChangePct: 1165.5, volumeStatus: "증가", status: "추격 주의",
  },
  {
    code: "217190", name: "제너셈", market: "KOSDAQ", marketCap: 83_400_000_000,
    price: 6340, date: "2026-08-21", previousClose: 6000, previousMa: 6103,
    close: 6340, ma: 6104, gapPct: 3.87, previousVolume: 713594, volume: 2888758,
    volumeChangePct: 304.8, volumeStatus: "증가", status: "상승 진행",
  },
  {
    code: "070300", name: "퀀텀레일", market: "KOSDAQ", marketCap: 72_800_000_000,
    price: 2050, date: "2026-08-21", previousClose: 1738, previousMa: 2046,
    close: 2050, ma: 2044, gapPct: 0.29, previousVolume: 1525956, volume: 5693200,
    volumeChangePct: 273.1, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "000950", name: "전방", market: "KOSPI", marketCap: 57_000_000_000,
    price: 33900, date: "2026-08-21", previousClose: 31900, previousMa: 33258,
    close: 33900, ma: 33233, gapPct: 2.01, previousVolume: 8041, volume: 23355,
    volumeChangePct: 190.4, volumeStatus: "증가", status: "근접 돌파",
  },
  {
    code: "134060", name: "이퓨쳐", market: "KOSDAQ", marketCap: 25_900_000_000,
    price: 5430, date: "2026-08-21", previousClose: 4960, previousMa: 5279,
    close: 5430, ma: 5267, gapPct: 3.09, previousVolume: 29940, volume: 29717,
    volumeChangePct: -0.7, volumeStatus: "감소", status: "상승 진행",
  },
  {
    code: "001515", name: "SK증권우", market: "KOSPI", marketCap: 10_200_000_000,
    price: 5230, date: "2026-08-21", previousClose: 4260, previousMa: 5163,
    close: 5230, ma: 5152, gapPct: 1.51, previousVolume: 18977, volume: 204441,
    volumeChangePct: 977.3, volumeStatus: "증가", status: "근접 돌파",
  },
];

const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

function formatPrice(value: number) {
  return number.format(Math.round(value));
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

function ChartCanvas({ points, range }: { points: ChartPoint[]; range: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const visible = useMemo(() => points.slice(-range), [points, range]);
  const active = hoverIndex === null ? visible.at(-1) : visible[hoverIndex];

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
      const maValues = visible.flatMap((point) => (point.ma === null ? [] : [point.ma]));
      const minPrice = Math.min(...lows, ...maValues) * 0.985;
      const maxPrice = Math.max(...highs, ...maValues) * 1.015;
      const maxVolume = Math.max(...visible.map((point) => point.volume), 1);
      const xStep = plotWidth / Math.max(visible.length, 1);
      const candleWidth = Math.max(2, Math.min(9, xStep * 0.58));
      const x = (index: number) => left + xStep * (index + 0.5);
      const y = (price: number) =>
        top + ((maxPrice - price) / Math.max(maxPrice - minPrice, 1)) * (priceBottom - top);

      ctx.font = "11px var(--font-geist-mono), monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let line = 0; line < 5; line += 1) {
        const ratio = line / 4;
        const lineY = top + ratio * (priceBottom - top);
        const price = maxPrice - ratio * (maxPrice - minPrice);
        ctx.strokeStyle = "rgba(42, 54, 65, 0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, lineY);
        ctx.lineTo(width - right + 6, lineY);
        ctx.stroke();
        ctx.fillStyle = "#7d877f";
        ctx.fillText(number.format(Math.round(price)), width - right + 10, lineY);
      }

      visible.forEach((point, index) => {
        const up = point.close >= point.open;
        const color = up ? "#de5a3a" : "#2b7591";
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
        ctx.globalAlpha = 0.35;
        ctx.fillRect(center - candleWidth / 2, volumeBottom - volumeHeight, candleWidth, volumeHeight);
        ctx.globalAlpha = 1;
      });

      ctx.strokeStyle = "#bd8d20";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      visible.forEach((point, index) => {
        if (point.ma === null) return;
        if (!started) {
          ctx.moveTo(x(index), y(point.ma));
          started = true;
        } else {
          ctx.lineTo(x(index), y(point.ma));
        }
      });
      ctx.stroke();

      const labelIndexes = [0, Math.floor((visible.length - 1) / 2), visible.length - 1];
      ctx.fillStyle = "#8a928d";
      ctx.textAlign = "center";
      labelIndexes.forEach((index) => {
        if (index >= 0 && visible[index]) ctx.fillText(visible[index].date.slice(2), x(index), height - 10);
      });

      if (hoverIndex !== null && visible[hoverIndex]) {
        const center = x(hoverIndex);
        ctx.strokeStyle = "rgba(20, 30, 35, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(center, top);
        ctx.lineTo(center, volumeBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible, hoverIndex]);

  return (
    <div className="chart-wrap">
      <canvas
        ref={canvasRef}
        className="chart-canvas"
        role="img"
        aria-label="선택 종목의 캔들, 이동평균선과 거래량 차트"
        onPointerLeave={() => setHoverIndex(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const left = 10;
          const right = 62;
          const ratio = Math.max(0, Math.min(0.999, (event.clientX - rect.left - left) / (rect.width - left - right)));
          setHoverIndex(Math.min(visible.length - 1, Math.floor(ratio * visible.length)));
        }}
      />
      {active && (
        <div className="chart-readout" aria-live="polite">
          <span>{active.date}</span>
          <span>시 {formatPrice(active.open)}</span>
          <span>고 {formatPrice(active.high)}</span>
          <span>저 {formatPrice(active.low)}</span>
          <span>종 {formatPrice(active.close)}</span>
          <span>거래량 {formatVolume(active.volume)}</span>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [timeframe, setTimeframe] = useState<Timeframe>("weekly");
  const [maPeriod, setMaPeriod] = useState<10 | 240>(240);
  const [market, setMarket] = useState<MarketFilter>("all");
  const [results, setResults] = useState<Candidate[]>(INITIAL_RESULTS);
  const [selectedCode, setSelectedCode] = useState(INITIAL_RESULTS[0].code);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [volumeFilter, setVolumeFilter] = useState("all");
  const [range, setRange] = useState(80);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failures: 0 });
  const [message, setMessage] = useState("최근 저장된 240주선 스캔 결과");
  const scanToken = useRef(0);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return results.filter((item) => {
      if (normalized && !`${item.name} ${item.code}`.toLowerCase().includes(normalized)) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (volumeFilter !== "all" && item.volumeStatus !== volumeFilter) return false;
      return true;
    });
  }, [results, query, statusFilter, volumeFilter]);

  const selected = results.find((item) => item.code === selectedCode) ?? filtered[0] ?? results[0];

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setChartLoading(true);
    fetch(`/api/chart?code=${selected.code}&timeframe=${timeframe}&ma=${maPeriod}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("차트를 불러오지 못했습니다.");
        return response.json() as Promise<{ points: ChartPoint[] }>;
      })
      .then((payload) => setChart(payload.points))
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setMessage(error.message);
      })
      .finally(() => setChartLoading(false));
    return () => controller.abort();
  }, [selected?.code, timeframe, maPeriod]);

  async function runFullScan() {
    const token = ++scanToken.current;
    setScanning(true);
    setResults([]);
    setProgress({ done: 0, total: 0, failures: 0 });
    setMessage("시장 종목 목록을 불러오는 중");
    try {
      const universeResponse = await fetch(`/api/universe?market=${market}`);
      if (!universeResponse.ok) throw new Error("시장 종목 목록을 불러오지 못했습니다.");
      const universePayload = (await universeResponse.json()) as { tickers: Ticker[] };
      const tickers = universePayload.tickers;
      setProgress({ done: 0, total: tickers.length, failures: 0 });
      setMessage(`${tickers.length.toLocaleString("ko-KR")}종목 분석 중`);
      const batches: Ticker[][] = [];
      for (let index = 0; index < tickers.length; index += 24) batches.push(tickers.slice(index, index + 24));
      let cursor = 0;
      let done = 0;
      let failures = 0;
      const matches: Candidate[] = [];
      const workers = Array.from({ length: 4 }, async () => {
        while (cursor < batches.length && scanToken.current === token) {
          const batch = batches[cursor++];
          const response = await fetch("/api/screen", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tickers: batch, timeframe, maPeriod }),
          });
          if (!response.ok) {
            failures += batch.length;
          } else {
            const payload = (await response.json()) as {
              matches: Candidate[];
              failures: number;
            };
            matches.push(...payload.matches);
            failures += payload.failures;
          }
          done += batch.length;
          const sorted = [...matches].sort((a, b) => b.marketCap - a.marketCap || a.code.localeCompare(b.code));
          setResults(sorted);
          setProgress({ done, total: tickers.length, failures });
          setMessage(`${done.toLocaleString("ko-KR")} / ${tickers.length.toLocaleString("ko-KR")} 분석`);
        }
      });
      await Promise.all(workers);
      if (scanToken.current !== token) return;
      const sorted = matches.sort((a, b) => b.marketCap - a.marketCap || a.code.localeCompare(b.code));
      setResults(sorted);
      if (sorted[0]) setSelectedCode(sorted[0].code);
      setMessage(`방금 완료 · ${sorted.length}종목 포착${failures ? ` · ${failures}건 실패` : ""}`);
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
  const progressPct = progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">M</div>
          <div>
            <p className="eyebrow">KOREA EQUITY SIGNAL DESK</p>
            <h1>MA Radar</h1>
          </div>
        </div>
        <div className="market-clock">
          <span className="live-dot" />
          <span>실시간 데이터 연결</span>
          <span className="clock-separator">KST</span>
        </div>
      </header>

      <section className="control-deck" aria-label="스크리닝 조건">
        <div className="control-group">
          <span className="control-label">봉</span>
          <div className="segmented">
            {(["weekly", "monthly"] as Timeframe[]).map((value) => (
              <button key={value} className={timeframe === value ? "active" : ""} onClick={() => setTimeframe(value)}>
                {value === "weekly" ? "주봉" : "월봉"}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span className="control-label">이평</span>
          <div className="segmented">
            {[10, 240].map((value) => (
              <button key={value} className={maPeriod === value ? "active" : ""} onClick={() => setMaPeriod(value as 10 | 240)}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="select-field">
          <span>시장</span>
          <select value={market} onChange={(event) => setMarket(event.target.value as MarketFilter)}>
            <option value="all">전체</option>
            <option value="kospi">KOSPI</option>
            <option value="kosdaq">KOSDAQ</option>
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
        <article><span>포착 종목</span><strong>{results.length}</strong><small>현재 조건</small></article>
        <article><span>근접 돌파</span><strong>{nearCount}</strong><small>이격 3% 이하</small></article>
        <article><span>거래량 증가</span><strong>{volumeUpCount}</strong><small>직전 봉 대비</small></article>
        <article><span>분석 실패</span><strong>{progress.failures}</strong><small>최근 실행</small></article>
      </section>

      <section className="workspace">
        <aside className="candidate-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BREAKOUT LIST</p>
              <h2>돌파 후보</h2>
            </div>
            <span className="count-pill">{filtered.length}</span>
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="회사명 또는 코드" />
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
          <div className="candidate-list">
            {filtered.map((item, index) => (
              <button
                key={item.code}
                className={`candidate-row ${selected?.code === item.code ? "selected" : ""}`}
                onClick={() => setSelectedCode(item.code)}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="candidate-main">
                  <strong>{item.name}</strong>
                  <small>{item.code} · {item.market} · {formatCap(item.marketCap)}</small>
                </span>
                <span className="candidate-metric">
                  <strong>{signed(item.gapPct, 2)}</strong>
                  <small className={item.volumeStatus === "감소" ? "down" : "up"}>
                    거래량 {signed(item.volumeChangePct)}
                  </small>
                </span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">조건에 맞는 후보가 없습니다.</div>}
          </div>
        </aside>

        <section className="chart-panel">
          {selected ? (
            <>
              <div className="security-header">
                <div>
                  <div className="security-title">
                    <h2>{selected.name}</h2>
                    <span>{selected.code}</span>
                    <span className={`market-tag ${selected.market.toLowerCase()}`}>{selected.market}</span>
                  </div>
                  <p>{timeframe === "weekly" ? "주봉" : "월봉"} · {maPeriod}기간 이동평균 상향돌파</p>
                </div>
                <div className="security-price">
                  <strong>{formatPrice(selected.close)}</strong>
                  <span>원</span>
                </div>
              </div>

              <div className="metric-grid">
                <article><span>시가총액</span><strong>{formatCap(selected.marketCap)}</strong></article>
                <article><span>{maPeriod}{timeframe === "weekly" ? "주" : "개월"}선</span><strong>{formatPrice(selected.ma)}</strong></article>
                <article><span>이평 이격도</span><strong className="positive">{signed(selected.gapPct, 2)}</strong></article>
                <article><span>거래량 변화</span><strong className={selected.volumeStatus === "감소" ? "negative" : "positive"}>{selected.volumeStatus} {signed(selected.volumeChangePct)}</strong></article>
              </div>

              <div className="chart-card">
                <div className="chart-toolbar">
                  <div className="chart-legend">
                    <span><i className="legend-candle" /> 캔들</span>
                    <span><i className="legend-ma" /> MA {maPeriod}</span>
                    <span><i className="legend-volume" /> 거래량</span>
                  </div>
                  <div className="range-buttons">
                    {[50, 80, 140].map((value) => (
                      <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value}봉</button>
                    ))}
                  </div>
                </div>
                {chartLoading ? <div className="chart-loading">차트를 불러오는 중…</div> : <ChartCanvas points={chart} range={range} />}
              </div>

              <div className="evidence-grid">
                <article className="evidence-card">
                  <div className="step-number">01</div>
                  <div><span>직전 봉</span><strong>{formatPrice(selected.previousClose)}원</strong><small>이평 {formatPrice(selected.previousMa)}원 이하</small></div>
                </article>
                <div className="flow-arrow">→</div>
                <article className="evidence-card current">
                  <div className="step-number">02</div>
                  <div><span>현재 봉</span><strong>{formatPrice(selected.close)}원</strong><small>이평 {formatPrice(selected.ma)}원 상회</small></div>
                </article>
                <article className="volume-card">
                  <span>거래량 비교</span>
                  <div><strong>{formatVolume(selected.previousVolume)}</strong><em>→</em><strong>{formatVolume(selected.volume)}</strong></div>
                  <small className={selected.volumeStatus === "감소" ? "negative" : "positive"}>{selected.volumeStatus} {signed(selected.volumeChangePct)}</small>
                </article>
              </div>
            </>
          ) : (
            <div className="chart-empty">스크리닝을 실행해 차트 후보를 불러오세요.</div>
          )}
        </section>
      </section>

      <footer>
        <p>현재 봉은 진행 중이므로 신호와 거래량 비교는 마감 전까지 달라질 수 있습니다.</p>
        <p>데이터는 공개 시장 정보를 기반으로 하며 투자 판단을 보장하지 않습니다.</p>
      </footer>
    </main>
  );
}
