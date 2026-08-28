import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(path = "/", init = undefined) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { accept: "text/html", ...init?.headers },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("rejects unauthenticated market-data API requests", async () => {
  for (const path of ["/api/chart?code=005930&market=KOSPI", "/api/search?query=삼성", "/api/universe", "/api/game/me", "/api/favorites"]) {
    const response = await render(path);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "로그인이 필요합니다." });
  }

  const enrollment = await render("/api/game/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname: "검증사용자", acceptedRules: true }),
  });
  assert.equal(enrollment.status, 401);
  assert.deepEqual(await enrollment.json(), { error: "로그인이 필요합니다." });

  const adminSeason = await render("/api/admin/game/seasons", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(adminSeason.status, 401);
  assert.deepEqual(await adminSeason.json(), { error: "로그인이 필요합니다." });

  for (const path of ["/api/game/portfolio", "/api/game/orders", "/api/game/leaderboard", "/api/game/activity", "/api/game/players/test-profile"]) {
    const response = await render(path);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "로그인이 필요합니다." });
  }

  const trade = await render("/api/game/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol: "005930", market: "KOSPI", side: "buy", quantity: 1, clientOrderId: "test-order-1" }),
  });
  assert.equal(trade.status, 401);
  assert.deepEqual(await trade.json(), { error: "로그인이 필요합니다." });
});

test("server-renders the Google login gate before the product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /선 넘네\.\./);
  assert.match(html, /LINE BREAKER/);
  assert.match(html, /brand-mark\.png/);
  assert.match(html, /한·미 주식 이평 돌파 차트/);
  assert.match(html, /로그인 상태 확인 중/);
  assert.doesNotMatch(html, /전 종목 새로 스캔/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships product metadata and removes the disposable preview", async () => {
  const [layout, page, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /선 넘네\.\./);
  assert.match(layout, /openGraph/);
  assert.match(layout, /brand-mark\.png/);
  assert.match(layout, /favicon\.ico/);
  assert.match(layout, /favicon-32\.png/);
  assert.match(layout, /site\.webmanifest/);
  assert.match(page, /ChartCanvas/);
  assert.match(page, /brand-logo/);
  assert.match(page, /LINE BREAKER/);
  assert.match(page, /KOREA &amp; U\.S\. MARKETS/);
  assert.match(page, /Google로 계속하기/);
  assert.match(page, /\/api\/auth\/session/);
  assert.match(page, /\/api\/auth\/google\/start/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(page, /선 넘는 리그/);
  assert.match(page, /\/api\/game\/me/);
  assert.match(page, /\/api\/game\/profile/);
  assert.match(page, /사이버 머니/);
  assert.match(page, /모의투자/);
  assert.match(page, /주문 내용 확인/);
  assert.match(page, /서버 시세로 체결 확정/);
  assert.match(page, /\/api\/game\/portfolio/);
  assert.match(page, /\/api\/game\/orders/);
  assert.match(page, /\/api\/game\/leaderboard/);
  assert.match(page, /\/api\/game\/players\//);
  assert.match(page, /투자 순위/);
  assert.match(page, /최근 활동/);
  assert.match(page, /MY WATCHLISTS/);
  assert.match(page, /새 목록 이름/);
  assert.match(page, /현재 종목 추가/);
  assert.match(page, /\/api\/favorites/);
  assert.match(page, /시즌 운영/);
  assert.match(page, /시즌 생성은 기존 원장이나 시즌을 초기화하지 않습니다/);
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
  assert.match(page, /const safePanStart = maxPanStart - safePanOffset/);
  assert.match(page, /setPanOffset\(0\)/);
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
  assert.match(page, /const openMarketOverview = useCallback/);
  assert.match(page, /setDirectTicker\(null\)/);
  assert.match(page, /onClick=\{\(\) => openMarketOverview\(watch\.id\)\}/);
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
  await access(new URL("../app/api/auth/google/start/route.ts", import.meta.url));
  await access(new URL("../app/api/auth/google/callback/route.ts", import.meta.url));
  await access(new URL("../app/api/auth/session/route.ts", import.meta.url));
  await access(new URL("../app/api/auth/logout/route.ts", import.meta.url));
  await access(new URL("../app/api/game/me/route.ts", import.meta.url));
  await access(new URL("../app/api/game/profile/route.ts", import.meta.url));
  await access(new URL("../app/api/game/portfolio/route.ts", import.meta.url));
  await access(new URL("../app/api/game/orders/route.ts", import.meta.url));
  await access(new URL("../app/api/game/leaderboard/route.ts", import.meta.url));
  await access(new URL("../app/api/game/activity/route.ts", import.meta.url));
  await access(new URL("../app/api/game/players/[profileId]/route.ts", import.meta.url));
  await access(new URL("../app/api/admin/game/seasons/route.ts", import.meta.url));
  await access(new URL("../app/api/favorites/route.ts", import.meta.url));
  await access(new URL("../lib/favorites.ts", import.meta.url));
  await access(new URL("../lib/game.ts", import.meta.url));
  await access(new URL("../lib/game-trading.ts", import.meta.url));
  await access(new URL("../lib/game-league.ts", import.meta.url));
  await access(new URL("../lib/game-operations.ts", import.meta.url));
  await access(new URL("../lib/game-admin.ts", import.meta.url));
  await access(new URL("../lib/auth.ts", import.meta.url));
  await access(new URL("../public/favicon.ico", import.meta.url));
  await access(new URL("../public/favicon-32.png", import.meta.url));
  await access(new URL("../public/site.webmanifest", import.meta.url));
  await access(root);
});
