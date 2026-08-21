# MA Breakouts · 선 넘네..

KOSPI·KOSDAQ 종목을 대상으로 이동평균선 상향돌파를 찾고, 캔들 차트로 확인하는 웹 스크리너입니다.

## 프로덕션 서비스

- 서비스: [stock-chart-screener-web.vercel.app](https://stock-chart-screener-web.vercel.app)
- 호스팅: Vercel
- 상태: 프로덕션 배포 완료 — 화면과 `/api/search` 응답 확인

## 주요 기능

- 주봉·월봉 MA10 또는 MA240 상향돌파 스크리닝
- 주봉·월봉 AND 조건과 MA10·MA240 AND 조건
- KOSPI·KOSDAQ 시장 필터
- 주식·ETF·ETN 유형 필터
- 시가총액순 정렬, 종목명·코드 검색
- 전봉 대비 거래량 증감과 현재가의 전일·전주·전월 등락률
- 일봉·주봉·월봉 차트 전환
- MA5·MA10·MA240 표시
- 마우스 오버 가로·세로 가격 가이드
- 차트 좌우 드래그 이동과 표시 범위 조절
- 종목명 클릭 시 네이버 금융 상세 페이지 열기
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

네이버 API는 공식 공개 SDK가 아닌 웹 서비스용 엔드포인트이므로 응답 형식이나 접근 제한이 변경될 수 있습니다.

## 로컬 실행

요구 사항: Node.js `>=22.13.0`

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

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
  api/universe/route.ts    전체 종목 목록
  api/screen/route.ts      배치 스크리닝
  api/chart/route.ts       차트 데이터
  api/search/route.ts      종목 검색
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

## 라이선스·투자 주의

이 프로젝트는 개인용 분석 도구 예제입니다. 데이터 지연·누락 가능성이 있으며, 스크리닝 결과는 투자 권유나 수익을 보장하지 않습니다.
