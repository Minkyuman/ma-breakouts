---
name: paper-trading-builder
description: LINE BREAKER의 시즌제 사이버머니 모의투자를 기획하고 구현한다. 참가자 온보딩과 시드머니, 주문·체결·원장, 한국/미국 주식과 환율, 포트폴리오, 순위표, 다른 참가자 보유종목 공개, 시즌 운영, 관련 DB/API/UI/테스트를 변경할 때 사용한다.
---

# Paper Trading Builder

## 목적

모의투자 기능을 재미있는 UI뿐 아니라 거래 원장과 동시성까지 일관되게 구현한다. 먼저 저장소의 `AGENTS.md`와 `.codex/notes/paper-trading.md`를 완전히 읽고 해당 문서의 도메인 규칙을 우선한다.

## 작업 분류

요청을 아래 중 하나로 분류한다.

- 기획/규칙 변경: 제품 규칙, 공개 범위, 순위 공식, 시즌 정책을 먼저 갱신한다.
- DB/도메인 변경: migration, transaction boundary, 불변식, 재구축 가능성을 함께 다룬다.
- API 변경: 인증, 권한, 서버 가격 결정, 멱등성, rate limit을 검증한다.
- UI 변경: `내 투자`, 주문 확인, 리그/사용자 상세, 모바일과 접근성을 다룬다.
- 운영 변경: 시즌 시작/종료/초기화, 관리자 감사 기록, 백업과 복구를 다룬다.

프로덕션 인프라 생성, migration 적용, 시즌 초기화, 배포는 사용자가 명시적으로 요청한 경우에만 수행한다.

## 구현 워크플로

1. 현재 milestone과 사용자가 볼 결과를 한 문장으로 정의한다.
2. `.codex/notes/paper-trading.md`에서 관련 규칙, 불변식, 완료 조건을 찾는다.
3. 기존 auth, quote, chart, DB adapter와 테스트를 조사한다.
4. `references/implementation-checklist.md`의 위협·정합성 항목을 설계에 반영한다.
5. 가장 작은 수직 slice로 구현한다. 스키마만 만들고 사용 경로를 방치하지 않는다.
6. 금액 변경은 한 DB transaction, 하나의 멱등 키, 하나의 감사 가능한 receipt로 끝낸다.
7. unit, integration, concurrency, privacy/reconciliation 테스트를 위험도에 맞춰 추가한다.
8. targeted test 후 lint와 전체 테스트를 실행한다.
9. durable decision이나 다음 gate를 `.codex/notes/paper-trading.md`에 갱신한다.
10. 하네스 자체 변경이면 `scripts/validate_harness.sh`를 실행한다.

## 금지 사항

- 브라우저가 보낸 현재가, 환율, 수익률, 잔액을 신뢰하지 않는다.
- `number` 기반 부동소수점으로 돈을 누적하지 않는다.
- email을 사용자 PK나 공개 nickname으로 사용하지 않는다.
- 실패한 transaction 일부를 후속 `update`로 땜질하지 않는다.
- 원장 기록을 수정하거나 시즌 reset 때 삭제하지 않는다.
- 캐시된 position/equity만 남기고 재구축 경로를 생략하지 않는다.
- 실제 주문처럼 오해할 표현이나 과도한 거래를 부추기는 UX를 넣지 않는다.

## 완료 보고

결과를 먼저 말하고 다음을 간결하게 포함한다.

- 완성된 사용자 흐름;
- 변경한 schema/API/UI와 핵심 불변식;
- 실행한 테스트와 결과;
- 실행하지 않은 production 작업과 남은 의사결정.

## 리소스

- `references/implementation-checklist.md`: milestone별 보안·정합성·UX 체크리스트.
- `scripts/validate_harness.sh`: 하네스 필수 파일과 핵심 규칙 검증.

