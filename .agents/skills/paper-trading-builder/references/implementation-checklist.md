# Paper-trading implementation checklist

## Identity and privacy

- Google `sub` is unique and immutable in the app model.
- Public APIs use profile IDs/nicknames and omit email.
- Participant and administrator roles are separate from the login allowlist.

## Money and execution

- Client submits intent only; server selects quote and FX.
- Decimal arithmetic is lossless across DB and application boundaries.
- Portfolio row is locked or optimistic-version checked.
- Idempotency uniqueness is enforced by the database.
- Ledger, execution, and position projection commit atomically.
- Buy validates cash; sell validates available quantity.
- Receipt includes quote time, FX time, simulated status, and rule version.

## Valuation and ranking

- Every KR/US position has a native price and required FX snapshot.
- Stale/missing data has explicit behavior and cannot silently become zero.
- Ranking formula and tie-breakers match the product note.
- Cached leaderboard can be independently rebuilt and compared.

## Lifecycle and operations

- First-entry account creation is concurrency safe.
- Season close blocks new orders without deleting history.
- New season creates new portfolios and seed ledger entries.
- Corrections are compensating ledger entries with audit events.
- Production migration has backup, dry run, observation, and rollback steps.

## UX

- Every trade surface says `사이버 머니 · 실제 주문 아님`.
- Confirmation shows symbol, side, quantity, estimated KRW amount, price/FX timestamps.
- Failure does not optimistically leave cash or holdings changed.
- Mobile tap, keyboard flow, loading, retry, and duplicate submission are tested.

