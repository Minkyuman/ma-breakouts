import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 선 넘네 product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /선 넘네\.\./);
  assert.match(html, /LINE BREAKER/);
  assert.match(html, /brand-mark\.png/);
  assert.match(html, /한·미 주식 이평 돌파 차트/);
  assert.match(html, /전 종목 새로 스캔/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships product metadata and removes the disposable preview", async () => {
  const [layout, page, styles, packageJson, faviconRoute] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/favicon/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /선 넘네\.\./);
  assert.match(layout, /openGraph/);
  assert.match(layout, /brand-mark\.png/);
  assert.match(layout, /favicon\.svg/);
  assert.match(layout, /\/api\/favicon/);
  assert.match(faviconRoute, /ImageResponse/);
  assert.match(page, /ChartCanvas/);
  assert.match(page, /brand-logo/);
  assert.match(page, /LINE BREAKER/);
  assert.match(page, /KOREA &amp; U\.S\. MARKETS/);
  assert.match(page, /ctx\.lineWidth = 0\.8/);
  assert.match(page, /MA 5/);
  assert.match(page, /MA 10/);
  assert.match(page, /MA 240/);
  assert.match(page, /legend-ma240/);
  assert.match(page, /readout-stat/);
  assert.match(page, /<em>시가<\/em>/);
  assert.match(page, /data-candle-direction/);
  assert.match(page, /양봉/);
  assert.match(page, /음봉/);
  assert.match(page, /candleDownColor/);
  assert.match(styles, /--candle-down:\s*#2f6fd6/);
  assert.match(page, /직전 봉 대비/);
  assert.match(page, /priceChangePct/);
  assert.match(page, /ETF·ETN/);
  assert.match(page, /assetType/);
  assert.match(page, /주&월/);
  assert.match(page, /AND 돌파 종목/);
  assert.match(page, /chart-period-buttons/);
  assert.match(page, /일봉 보기/);
  assert.match(page, /ChartTimeframe/);
  assert.match(page, /chart-range-control/);
  assert.match(page, /차트 표시 봉 수/);
  assert.match(page, /10&240/);
  assert.match(page, /detailCurrentMa10/);
  assert.match(page, /detailCurrentMa240/);
  assert.doesNotMatch(page, /chart-ma-buttons|MA10 기준|MA240 기준/);
  assert.match(page, /현재가/);
  assert.match(page, /current-price-change/);
  assert.match(page, /priceChanges/);
  assert.match(page, /price-change-item/);
  assert.match(page, /전일/);
  assert.match(page, /전주/);
  assert.match(page, /전월/);
  assert.match(page, /latestPrices/);
  assert.match(page, /global-stock-search/);
  assert.match(page, /전체 종목명 또는 코드 검색/);
  assert.match(page, /\/api\/search\?query=/);
  assert.match(page, /m\.stock\.naver\.com\/worldstock\/stock/);
  assert.match(page, /m\.stock\.naver\.com\/domestic\/stock/);
  assert.match(page, /naverStockPageUrl/);
  assert.match(page, /ScreeningTimeframe/);
  assert.match(page, /runFullScan/);
  assert.match(page, /MARKET PULSE/);
  assert.match(page, /MARKET_WATCHES/);
  assert.match(page, /\/api\/market-chart/);
  assert.doesNotMatch(page, /useState<Candidate\[\]>\(INITIAL_RESULTS\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../app/api/screen/route.ts", import.meta.url));
  await access(new URL("../app/api/chart/route.ts", import.meta.url));
  await access(new URL("../app/api/market-chart/route.ts", import.meta.url));
  await access(new URL("../app/api/universe/route.ts", import.meta.url));
  await access(new URL("../app/api/search/route.ts", import.meta.url));
  await access(new URL("../app/api/favicon/route.ts", import.meta.url));
  await access(root);
});
