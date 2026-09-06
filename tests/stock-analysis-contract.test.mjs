import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI stock analysis is authenticated, grounded, structured, and server-only", async () => {
  const [analysis, modelSettings, route, page, envExample] = await Promise.all([
    readFile(new URL("../lib/stock-analysis.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/analysis-model-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analysis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getSession\(request\)/);
  assert.match(route, /analyzeStock\(code, market\)/);
  assert.doesNotMatch(route, /input\.(?:price|marketCap|exchangeRate)/);
  assert.match(modelSettings, /qwen\/qwen3\.8-flash/);
  assert.match(analysis, /getConfiguredAnalysisModel/);
  assert.match(analysis, /response_format/);
  assert.match(analysis, /json_schema/);
  assert.match(analysis, /plugins: \[\{ id: "web", max_results: 7 \}\]/);
  assert.match(analysis, /avoiding a third simultaneous web-provider job prevents 429 bursts/);
  assert.match(analysis, /provider_retry_failed/);
  assert.match(analysis, /server-collected, cited Fact Pack/);
  assert.match(analysis, /reasoning: \{ effort: "none", exclude: true \}/);
  assert.match(analysis, /fetchTickerDailyChart/);
  assert.match(analysis, /fetchSecurityClassification/);
  assert.match(analysis, /fetchKoreanFundamentals/);
  assert.match(analysis, /fetchDartDisclosures/);
  assert.match(analysis, /fetchDartConvertibleOverhang/);
  assert.match(analysis, /cvbdIsDecsn\.json/);
  assert.match(analysis, /bdwtIsDecsn\.json/);
  assert.match(analysis, /totalPotentialShares/);
  assert.match(analysis, /volumeDays/);
  assert.match(analysis, /CB·BW의 발행조건 기준 잠재 오버행/);
  assert.match(analysis, /corpCode\.xml/);
  assert.match(analysis, /OpenDART 법인코드 조회 실패/);
  assert.match(analysis, /fetchUsFundamentals/);
  assert.match(analysis, /fetchSecFundamentals/);
  assert.match(analysis, /company_tickers\.json/);
  assert.match(analysis, /SEC EDGAR XBRL Company Facts/);
  assert.match(analysis, /fetchSecFilings/);
  assert.match(analysis, /data\.sec\.gov\/submissions/);
  assert.match(analysis, /US_PEER_GROUPS/);
  assert.match(analysis, /fetchUsPeerSnapshots/);
  assert.match(analysis, /fetchKoreanMarketIntelligence/);
  assert.match(analysis, /marketCap: ticker\.marketCap \|\| null/);
  assert.match(analysis, /주봉·월봉 MA10과 MA240은 이 서비스의 최우선 기술 지표/);
  assert.match(analysis, /v8:/);
  assert.match(analysis, /STOCK_ANALYSIS_SECTION_ORDER/);
  assert.match(analysis, /allowedUrls\.has\(source\.url\)/);
  assert.match(analysis, /AnalysisEvidenceCard/);
  assert.match(page, /CB·BW 오버행 점검/);
  assert.match(page, /analysis\.convertibleOverhang\.totalPotentialShares/);
  assert.match(analysis, /analysisInstructions\(facts\)/);
  assert.match(analysis, /research_scout/);
  assert.match(analysis, /risk_reviewer/);
  assert.match(analysis, /const scoutResult = isQwen38Max \? noResearchResult : await researchAgent\("research_scout"\)/);
  assert.match(analysis, /const riskResult = isQwen38Max \? noResearchResult : await researchAgent\("risk_reviewer"\)/);
  assert.match(analysis, /qwen_rate_limit_retry/);
  assert.match(analysis, /incomplete_response_repair/);
  assert.match(analysis, /agentBriefForFinal/);
  assert.match(analysis, /assessAnalysisQuality/);
  assert.match(analysis, /citationCoveragePct/);
  assert.match(analysis, /압축 재시도/);
  assert.match(analysis, /summary 180자 이내/);
  assert.match(analysis, /이 분석은 투자 조언이 아니며/);
  assert.match(envExample, /OPENROUTER_API_KEY=/);
  assert.match(envExample, /OPENDART_API_KEY=/);
  assert.doesNotMatch(page, /OPENROUTER_API_KEY/);
  assert.match(page, /확인된 재무·밸류에이션/);
  assert.match(page, /VERIFIED FUNDAMENTALS/);
  assert.match(page, /VERIFIED MARKET INTELLIGENCE/);
  assert.match(page, /RESEARCH QUALITY/);
  assert.match(page, /FACT LEDGER/);
  assert.match(page, /강세 논지와 반대 논지를 독립적으로 검토/);
  assert.match(route, /maxDuration = 180/);
  assert.match(page, /analysisRequestRef/);
  assert.match(page, /analysisRequestRef\.current !== requestId/);
  assert.match(page, /\}, \[ticker\.code, ticker\.market\]\);/);
});
