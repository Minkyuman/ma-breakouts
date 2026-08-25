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
- 미국은 거래소별 시가총액 상위 1,000개 보통주를 우선 스캔하며 ETF·ETN·우선주·워런트 등은 제외
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
- Google 로그인 후에만 대시보드와 시장 데이터 API 이용 가능
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
- 미국 종목 목록·일봉 가격·거래량: Nasdaq 공개 API
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

운영 환경에서는 같은 변수의 Vercel Production 환경값을 등록하되 `AUTH_BASE_URL`을 `https://stock-chart-screener-web.vercel.app`으로 설정합니다. `AUTH_ALLOWED_EMAILS`는 선택 사항이며, 비워 두면 검증된 모든 Google 계정을 허용하고 쉼표로 이메일을 지정하면 해당 계정만 허용합니다. 비밀값은 저장소에 커밋하지 않습니다. 구현은 Google OpenID Connect의 `openid email profile` 범위를 사용하며 로그인 세션은 서명된 HttpOnly 쿠키로 7일간 유지됩니다.

## 검증 명령

```bash
npm run build
npm test
```

`npm test`는 빌드 후 서버 렌더링 테스트를 실행합니다.

## 프로젝트 구조

```text
app/
  page.tsx                 화면·차트·스크리닝 UI
  globals.css              디자인 시스템과 반응형 스타일
  api/auth/                Google OAuth·세션·로그아웃
  api/universe/route.ts    전체 종목 목록
  api/screen/route.ts      배치 스크리닝
  api/chart/route.ts       차트 데이터
  api/search/route.ts      종목 검색
lib/auth.ts                세션 서명·검증과 인증 공통 처리
lib/market.ts              시장 데이터, 집계, 이동평균, 돌파 판정
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

Google 로그인을 활성화한 배포 전에는 Vercel 프로젝트의 Production 환경변수에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_BASE_URL`을 먼저 등록해야 합니다. 개인 전용 서비스라면 `AUTH_ALLOWED_EMAILS`도 함께 등록합니다.

## 라이선스·투자 주의

이 프로젝트는 개인용 분석 도구 예제입니다. 데이터 지연·누락 가능성이 있으며, 스크리닝 결과는 투자 권유나 수익을 보장하지 않습니다.
