# MA Breakouts · 선 넘네..

한국·미국 주식의 이동평균선 상향돌파를 찾고, 캔들 차트로 확인하는 웹 스크리너입니다.

## 프로덕션 서비스

- 서비스: [stock-chart-screener-web.vercel.app](https://stock-chart-screener-web.vercel.app)
- 호스팅: Vercel
- 상태: 프로덕션 배포 완료 — 화면과 `/api/search` 응답 확인

## 주요 기능

- 주봉·월봉 MA10 또는 MA240 상향돌파 스크리닝
- 주봉·월봉 AND 조건과 MA10·MA240 AND 조건
- KOSPI·KOSDAQ 시장 필터
- 미국 시장 전환 및 NASDAQ·NYSE·AMEX 필터
- 미국은 거래소별 시가총액 상위 1,000개 보통주와 별도로, 유동성·대표성을 기준으로 선별한 주요 ETF를 스캔. ETN·우선주·워런트 등은 제외
- 주식·ETF·ETN 유형 필터
- 시가총액순 정렬, 종목명·코드 검색
- 전봉 대비 거래량 증감과 현재가의 전일·전주·전월 등락률
- 미국 종목은 USD 현재가와 적용 USD/KRW 환율 기준 원화 환산가를 함께 표시
- NASDAQ 100 구성종목은 목록과 종목 헤더에 `NASDAQ 100` 배지 표시
- 한국·미국 종목의 섹터와 자동 분류 테마(최대 3개)를 후보 목록·상세 헤더에 표시하고, 목록 배지 클릭으로 동일 섹터·테마만 필터링
- 일봉·주봉·월봉 차트 전환
- MA5·MA10·MA240 표시
- 마우스 오버 가로·세로 가격 가이드
- 차트 좌우 드래그 이동과 표시 범위 조절
- 종목명 클릭 시 네이버 금융 상세 페이지 열기
- 미국 종목명 클릭 시 네이버 해외증권 상세 페이지 열기
- 로그인 사용자를 위한 OpenRouter 기반 AI 종목 심층분석: 사업 실체·거시환경·기술·펀더멘털·재료·대응전략 7개 섹션, 진입가·목표가·손절가와 시나리오 제공
- Google 로그인 후에만 대시보드와 시장 데이터 API 이용 가능
- 계정별 이름 있는 즐겨찾기 목록: 기본 `관심종목`, 목록 생성·이름 변경·삭제, 한·미 종목 추가·삭제, 저장 종목에서 차트 바로 열기
- `선 넘는 리그` Phase 2 제공: 고유 닉네임 등록, 사이버 머니 1억 원, 국내 주식·ETF와 미국 주식 모의 매수·매도, 보유 종목과 체결 내역
- 개발 환경에서 `선 넘는 리그` Phase 3 제공: 서버 시세 기반 원화 평가, 투자 순위·순위 변동·배지, 참가자 보유종목, 공개 동의형 활동 피드
- 개발 환경에서 `선 넘는 리그` Phase 4 하드닝 제공: DB 요청 제한, 요청 ID 추적, 관리자 시즌·감사 화면, 접근성·모바일 레이아웃 보완
- 로고 확대 모달과 이메일 연락 링크

## 돌파 판정

각 봉의 종가 기준으로 판정합니다.

```text
직전 봉 종가 <= 직전 MA
현재 봉 종가 > 현재 MA
```

AND 조건은 동일 종목의 동일 기준 봉에서 모든 조건을 만족해야 결과에 포함합니다. MA240 조건은 충분한 과거 봉이 없는 신규 상장 종목에서는 판정할 수 없습니다.

## 데이터 출처

- 종목 목록: 네이버 모바일 주식 시장가치 API
- 가격·거래량: 네이버 국내 종목 일봉 API
- 일봉 데이터를 주봉·월봉으로 집계한 뒤 이동평균을 계산
- 미국 보통주 및 주요 ETF 목록·일봉 가격·거래량: Nasdaq 공개 API. ETF는 전체 상장 종목을 무차별 스캔하지 않고 관리형 주요 ETF 유니버스를 사용
- NASDAQ 100 여부: Nasdaq 종목 메타데이터의 구성종목 플래그
- 섹터: 네이버 금융 동종업종 정보(한국), Nasdaq 기업 프로필(미국)
- 테마: 기업 개요·산업 설명의 규칙 기반 키워드 분류. 투자 판단을 위한 공식 분류가 아님
- USD/KRW 환율: ExchangeRate-API 공개 환율 데이터

시장 API는 공식 SDK가 아닌 공개 웹 엔드포인트를 사용하므로 응답 형식이나 접근 제한이 변경될 수 있습니다. 미국 전체 시장 일괄 스캔은 향후 장 마감 후 배치 캐시로 확장할 예정이며, 현재는 사용자가 실행하는 화면 스캔의 응답성을 위해 상위 종목 범위를 사용합니다.

## 로컬 실행

요구 사항: Node.js `>=22.13.0`

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

AI 심층분석은 OpenRouter API를 서버에서만 호출합니다. `.env.local`에 키와 모델을 설정하며 키는 브라우저 번들이나 API 응답에 포함하지 않습니다. 기본 모델은 `qwen/qwen3.8-flash`이고, 웹 검색 사용량은 OpenRouter에서 별도 비용이 발생할 수 있습니다.

```dotenv
OPENROUTER_API_KEY=OpenRouter에서_발급한_키
OPENROUTER_ANALYSIS_MODEL=qwen/qwen3.8-flash
OPENROUTER_ANALYSIS_MODEL_SUGGESTIONS=qwen/qwen3.8-flash,qwen/qwen3.8-27b
```

DB `admin` 역할은 `선 넘는 리그 → 운영`에서 심층분석 모델을 바꿀 수 있습니다. 모델 변경은 전역 적용되고 감사 기록에 남으며, OpenRouter의 `provider/model` 표기와 구조화 출력·웹 검색 호환 모델만 사용해야 합니다. API 키는 이 화면에서 변경할 수 없습니다. 초기 운영자는 `GAME_ADMIN_EMAILS`에 쉼표로 지정합니다. 이 목록은 로그인 허용 목록과 별개이며, 해당 사용자가 리그를 열면 자신의 DB 계정만 `admin`으로 승격됩니다.

Supabase PostgreSQL을 포함한 리그 기능은 Cloudflare Worker 방식의 기본 개발 서버 대신 Vercel Node 빌드 미리보기를 사용합니다.

```bash
NITRO_PRESET=vercel npx vercel env run -e development -- npm run build
npx vercel env run -e development -- npm run preview:vercel
```

이 방식은 로컬 Google OAuth 설정과 Vercel Development의 `DATABASE_URL`을 함께 사용하며 Production DB에는 연결하지 않습니다.

## Google 로그인 설정

Google Cloud Console에서 OAuth 동의 화면을 구성하고 `웹 애플리케이션` 유형의 OAuth 클라이언트를 생성합니다. 승인된 리디렉션 URI에는 사용하는 환경에 맞춰 아래 주소를 정확히 등록합니다.

```text
http://localhost:3000/api/auth/google/callback
https://stock-chart-screener-web.vercel.app/api/auth/google/callback
```

`.env.local`에 다음 값을 설정합니다. `AUTH_SECRET`은 세션 쿠키 서명용으로 충분히 긴 무작위 값을 사용합니다.

```dotenv
GOOGLE_CLIENT_ID=Google에서 발급한 클라이언트_ID
GOOGLE_CLIENT_SECRET=Google에서 발급한_클라이언트_보안_비밀번호
AUTH_SECRET=openssl_rand_base64_32_등으로_생성한_값
AUTH_BASE_URL=http://localhost:3000
AUTH_ALLOWED_EMAILS=minkyuman@gmail.com
```

운영 환경에서는 같은 변수의 Vercel Production 환경값을 등록하되 `AUTH_BASE_URL`을 `https://stock-chart-screener-web.vercel.app`으로 설정합니다. `AUTH_ALLOWED_EMAILS`는 선택 사항이며, 비워 두면 검증된 모든 Google 계정을 허용하고 쉼표로 이메일을 지정하면 해당 계정만 허용합니다. `GAME_ADMIN_EMAILS`는 운영 콘솔 접근용 이메일 목록으로, `AUTH_ALLOWED_EMAILS`와 분리해 최소 인원만 설정합니다. 비밀값은 저장소에 커밋하지 않습니다. 구현은 Google OpenID Connect의 `openid email profile` 범위를 사용하며 로그인 세션은 서명된 HttpOnly 쿠키로 7일간 유지됩니다.

## 검증 명령

```bash
npm run build
npm test
```

`npm test`는 빌드 후 서버 렌더링 테스트를 실행합니다.

## 모의투자 리그 개발 환경

리그 데이터는 기존 Google 로그인의 `sub`를 사용자 식별자로 사용하고 Supabase Postgres에 서버 전용으로 저장합니다. 브라우저에는 DB 키를 전달하지 않으며, 첫 참가 시 사용자·닉네임·포트폴리오·시작 자금 원장을 하나의 직렬화 트랜잭션으로 생성합니다.

```dotenv
DATABASE_URL=Supabase_Supavisor_transaction_pooler_URL
DATABASE_SSL=require
```

개발 프리시즌 생성과 Phase 1·2 동시성 검증은 Vercel Development 환경에서만 아래처럼 실행합니다.

```bash
ALLOW_DEV_SEED=true npx vercel env run -e development -- npm run db:seed:dev-season
ALLOW_PHASE1_DB_TEST=true npx vercel env run -e development -- npm run verify:phase1
ALLOW_PHASE2_DB_TEST=true npx vercel env run -e development -- npm run verify:phase2
ALLOW_PHASE3_DB_TEST=true npx vercel env run -e development -- npm run verify:phase3
ALLOW_PHASE4_DB_TEST=true npx vercel env run -e development -- npm run verify:phase4
```

Phase 2 주문 API는 브라우저의 가격·환율·잔고를 신뢰하지 않고 서버 시세로만 체결합니다. 직렬화 트랜잭션, 행 잠금, 멱등키와 정밀 소수 계산으로 중복 체결·초과 매수·초과 매도를 방지하며 영수증에 적용 시세와 환율 시각을 남깁니다. Production DB를 별도로 만들고 마이그레이션하기 전에는 리그 변경사항을 프로덕션에 배포하지 않습니다.

Phase 3 순위표도 서버가 모든 보유 종목의 시세와 환율을 다시 조회해 하나의 공통 평가 시점으로 만듭니다. 누락되거나 오래된 데이터가 있으면 전체 평가를 중단하며, 순위는 총 평가자산·누적 최대 낙폭·참가 시각 순으로 결정합니다. 다른 참가자에게는 닉네임과 선택적 아바타만 공개하고 이메일은 API 응답에 포함하지 않습니다.

Phase 4는 주문·평가·관리자 변경에 서버리스 공통 DB 요청 제한과 `x-request-id` 추적을 적용합니다. 시즌을 만드는 관리자 작업은 감사 기록과 하나의 트랜잭션으로 저장되며, 로그인 허용 목록과 관리자 역할은 분리됩니다. 운영·백업·장애 대응 절차는 `.codex/notes/paper-trading-runbook.md`에 기록되어 있습니다.

## 프로젝트 구조

```text
app/
  page.tsx                 화면·차트·스크리닝 UI
  globals.css              디자인 시스템과 반응형 스타일
  api/auth/                Google OAuth·세션·로그아웃
  api/favorites/           계정별 즐겨찾기 목록·종목 관리 API
  api/game/                리그 온보딩·포트폴리오·모의 주문 API
  api/admin/game/          DB admin 역할 전용 시즌 생성 API
  api/universe/route.ts    전체 종목 목록
  api/screen/route.ts      배치 스크리닝
  api/chart/route.ts       차트 데이터
  api/analysis/route.ts    로그인 전용 AI 심층분석 API
  api/search/route.ts      종목 검색
lib/auth.ts                세션 서명·검증과 인증 공통 처리
lib/game.ts                시즌 참가·시드 원장 트랜잭션
lib/game-trading.ts        모의 주문·체결·포지션 트랜잭션
lib/game-league.ts         포트폴리오 재평가·순위·공개 활동
lib/game-operations.ts     DB 요청 제한·요청 ID·운영 로그
lib/game-admin.ts          관리자 역할 검사·시즌 생성
lib/favorites.ts           즐겨찾기 소유권·목록·종목 관리
lib/market.ts              시장 데이터, 집계, 이동평균, 돌파 판정
lib/stock-analysis.ts      서버 가격 팩·OpenRouter 호출·분석 검증과 캐시
db/                        Supabase Postgres 연결과 Drizzle 스키마
drizzle/                   리그 DB 마이그레이션
scripts/                   개발 시즌 생성·동시성 통합 검증
public/brand-mark.png      선 넘네.. 브랜드 마크
tests/                     서버 렌더링 회귀 테스트
.openai/hosting.json       Sites 호스팅 설정
```

## Sites·vinext 설정

이 프로젝트는 [vinext](https://github.com/cloudflare/vinext) 기반이며, `.openai/hosting.json`과 `vite.config.ts`가 로컬·Sites 실행 환경의 바인딩 구성을 담당합니다. 현재 스크리너 데이터는 외부 시장 API에서 조회하므로 별도 D1 데이터베이스가 없어도 실행됩니다.

## Vercel 배포

`vercel.json`과 Nitro Vercel 어댑터가 포함되어 있어 API 라우트를 포함한 서버 렌더링 배포가 가능합니다. Vercel 환경에서는 `NITRO_PRESET=vercel`로 빌드되어 `.vercel/output`에 정적 자산과 서버 함수를 생성합니다.

```bash
npx vercel --prod
```

현재 프로덕션은 Vercel CLI로 배포되어 있습니다. GitHub 푸시마다 자동 배포하려면 Vercel 대시보드에서 GitHub Login Connection을 추가한 뒤 이 저장소를 Vercel 프로젝트에 연결하고, 사용할 프로덕션 브랜치를 지정하면 됩니다.

Google 로그인을 활성화한 배포 전에는 Vercel 프로젝트의 Production 환경변수에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_BASE_URL`을 먼저 등록해야 합니다. 개인 전용 서비스라면 `AUTH_ALLOWED_EMAILS`도 함께 등록합니다. AI 심층분석을 쓰려면 서버 전용 `OPENROUTER_API_KEY`와 기본 `OPENROUTER_ANALYSIS_MODEL`도 등록합니다. DB 스키마 변경 배포 시에는 일회성으로 `RUN_DB_MIGRATIONS=true`를 설정해 빌드 단계에서 Drizzle 마이그레이션을 적용한 뒤 다시 해제합니다.

## 라이선스·투자 주의

이 프로젝트는 개인용 분석 도구 예제입니다. 데이터 지연·누락 가능성이 있으며, 스크리닝 결과는 투자 권유나 수익을 보장하지 않습니다.
