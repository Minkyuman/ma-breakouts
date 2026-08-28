# LINE BREAKER League — product and engineering plan

Status: Phase 4 private preseason deployed; separate Production database migrated; first Production administrator enrollment/assignment pending
Last updated: 2026-08-28  
Working name: **LINE BREAKER League / 선 넘는 리그**

## 1. Outcome

Give every approved Google account the same virtual capital, let participants trade Korean and US stocks, and show a playful season leaderboard with each player's holdings. This is an entertainment/education simulation, not brokerage execution or investment advice.

Success means:

- an approved user receives one season account on first entry;
- buy/sell operations cannot create cash or shares through replay or concurrent requests;
- every balance can be reconciled from an immutable ledger;
- leaderboard returns are calculated by one documented formula;
- authenticated participants can inspect another player's nickname, return, cash ratio, and holdings without seeing email;
- Korean and US positions are valued consistently in KRW using timestamped FX data.

## 2. Game rules for MVP

| Rule | MVP decision |
|---|---|
| Format | Season-based competition |
| Starting capital | KRW 100,000,000 per participant; configurable per season |
| Eligible users | Existing Google-login allowlist; account created lazily on first league visit |
| Durable identity | Google `sub`; email is mutable metadata |
| Instruments | KR/US common stocks supported by the service; indices, FX, crypto, ETF/ETN excluded initially |
| Quantity | Whole shares only |
| Base currency | KRW |
| US settlement | USD quote converted with the server-selected USD/KRW FX snapshot; no separate USD wallet in MVP |
| Fees/taxes | Zero in the first friendly season; retain a versioned rule snapshot |
| Shorting/margin | Not allowed |
| Deposits/withdrawals | Not allowed during a season |
| Order type | Immediate simulated market fill at the latest server quote that passes freshness rules |
| Disclosure | Always show quote timestamp and `delayed simulation` status |
| Public identity | Unique nickname and optional Google avatar; never email |

### Price fairness caveat

The current service does not guarantee exchange-grade real-time quotes. MVP is therefore a no-prize friendly game. The server rejects missing or stale quotes and records the exact quote/FX timestamp. A competitive or prize season requires a later batch-settlement mode in which orders submitted before a cutoff all receive the same official close or next-open price.

## 3. Ranking and visibility

Primary rank:

`total_return_pct = (current_equity_krw - initial_cash_krw) / initial_cash_krw × 100`

`current_equity_krw = cash_krw + sum(position_quantity × latest_native_price × latest_fx_rate)`

Tie-breakers, in order:

1. larger equity;
2. smaller maximum drawdown;
3. earlier season join time.

Leaderboard rows show rank, nickname, total return, daily return, equity, cash ratio, and top three holdings. Player detail shows all current holdings and recent simulated trades. Real names and emails are hidden. A user may opt out of the activity feed, but holdings remain visible while participating because portfolio discovery is part of the game.

## 4. Main user experience

### Navigation

- `스크리너`: existing product.
- `내 투자`: cash, total equity, P&L, holdings, orders, and trade ticket.
- `선 넘는 리그`: season countdown, leaderboard, player portfolio, and activity feed.

### Entry flow

1. Approved user signs in with Google.
2. First league visit asks for a unique nickname and agreement to simulation rules.
3. Server creates the user, participant, portfolio, and initial cash-ledger entry atomically.
4. User can open a stock from the screener/chart and use a compact `모의 매수/매도` ticket.

### Fun without dark patterns

- badges such as `첫 돌파`, `10종목 탐험가`, `현금왕`, and weekly podium;
- season countdown and rank movement;
- no celebration language for financial loss and no prompts encouraging overtrading;
- persistent `사이버 머니 · 실제 주문 아님` label on order surfaces.

## 5. Data model

Target database: Supabase Free Postgres in Seoul (`ap-northeast-2`). Vercel uses the Supavisor transaction-pooler connection string and Drizzle migrations. Existing Google OAuth remains the identity provider; Supabase Auth is not introduced. Monetary columns use Postgres `numeric`, not JavaScript floats.

### Core tables

- `users`: `id`, `google_sub` unique, email, display name, avatar, timestamps.
- `game_profiles`: user id, unique nickname, visibility preferences, accepted-rules version.
- `seasons`: name, status, start/end, initial cash, base currency, rule version.
- `portfolios`: season/user unique pair, cached cash/equity, version, joined timestamp.
- `cash_ledger`: immutable credits/debits, native/base amounts, reason, execution id, idempotency key.
- `orders`: portfolio, symbol, market, side, quantity, status, client idempotency key, requested timestamp.
- `executions`: order, quantity, native price/currency, FX rate, base gross/net, quote source/timestamp, fee/rule snapshots.
- `positions`: portfolio/symbol projection with quantity, average cost, realized P&L, version.
- `price_snapshots`: symbol, market, native currency/price, source and received timestamps.
- `fx_snapshots`: pair, rate, source and received timestamps.
- `leaderboard_snapshots`: season/user/rank/equity/return and valuation timestamp.
- `audit_events`: privileged actions such as season creation, correction, or reset.

### Invariants

- one portfolio per `(season_id, user_id)`;
- `cash >= 0` and `position.quantity >= 0` for MVP;
- a client idempotency key can settle at most one order per portfolio;
- cash ledger sum equals portfolio cash;
- execution quantities reconcile with order and position movements;
- a valuation is never newer than its oldest included quote/FX timestamp;
- season reset creates a new season/account and never rewrites old ledger history.

## 6. Transaction boundary

The browser sends only `symbol`, `market`, `side`, `quantity`, and an idempotency key.

For an immediate MVP order, the server must:

1. authenticate and resolve Google `sub`;
2. validate active season, membership, symbol, quantity, and rate limit;
3. fetch/select server-side quote and FX snapshot and enforce freshness;
4. begin a DB transaction and lock or version-check the portfolio;
5. check cash or available shares;
6. insert order and execution, append ledger entries, update position projection;
7. update cached cash/version and commit;
8. return the server-calculated receipt.

Any failure rolls back the full operation. A repeated idempotency key returns the original receipt. Never partially repair an order in the request path.

## 7. API outline

- `GET /api/game/season` — active season and rules.
- `GET/PUT /api/game/profile` — nickname and preferences.
- `GET /api/game/me` — portfolio summary and holdings.
- `POST /api/game/orders` — simulated buy/sell.
- `GET /api/game/orders` — personal order history.
- `GET /api/game/leaderboard` — paged season ranking.
- `GET /api/game/players/:profileId` — public portfolio detail.
- `GET /api/game/activity` — recent participant activity.
- `POST /api/admin/game/seasons` — owner-only season creation with audit event.

Every route uses the existing session guard. Admin authorization must be a role/claim, not merely an email in the login allowlist.

## 8. Delivery roadmap

### Phase 0 — Supabase foundation

- Create the Supabase organization/project in Seoul and keep it on the Free plan.
- Add development/preview/production database separation and secret handling; use pooled `DATABASE_URL` for Vercel.
- Replace the current D1/SQLite starter adapter with Postgres.js and Drizzle PostgreSQL.
- Define quote freshness per KR/US source and FX source.

Exit: migration runs against an empty development DB and rollback/recovery is documented.

### Phase 1 — identity, season, and seed money

- Implement migrations for users, profiles, seasons, portfolios, and ledger.
- Create participants lazily from Google `sub`.
- Add nickname onboarding and owner-only season creation.
- Seed KRW 100,000,000 via an immutable ledger entry.

Exit: concurrent first visits create exactly one portfolio and one seed credit.

### Phase 2 — trading and portfolio

- Implement quote/FX adapters and freshness checks.
- Implement idempotent transactional buy/sell.
- Add `내 투자`, trade ticket, holdings, receipts, and history.

Exit: double-spend, oversell, replay, stale quote, and FX tests pass.

### Phase 3 — league and social visibility

- Implement KRW valuation, rank snapshots, leaderboard, player detail, and activity feed.
- Add rank movement and lightweight badges.

Exit: ledger reconciliation and independently recomputed leaderboard match projections.

### Phase 4 — hardening and release

- Add rate limiting, observability, admin audit, responsive/mobile testing, accessibility, and incident runbook.
- Run a private preseason with existing allowed accounts, then start Season 1.

Exit: no P0/P1 defects, production backup verified, season reset tested, and simulation disclosure visible.

## 9. Required tests

- unit: buy, sell, average cost, realized/unrealized P&L, KRW conversion, fees, ties, drawdown;
- transaction: simultaneous buys cannot overspend and simultaneous sells cannot oversell;
- idempotency: retry creates one execution and one ledger effect;
- auth: unauthenticated, unapproved, participant, and admin boundaries;
- privacy: no API/UI response exposes another participant's email;
- valuation: stale/missing quote and FX behavior, mixed KR/US portfolio;
- reconciliation: ledger-to-cash and executions-to-positions rebuild;
- lifecycle: late join, season close, new season, historical view;
- UI: mobile trade confirmation, keyboard flow, error/rollback state.

## 10. Open decisions before Phase 0

1. Confirm instant delayed quotes for the friendly season or fair batch-close settlement.
2. Confirm starting capital (recommended KRW 100 million), season length (recommended four weeks), and ETF exclusion.
3. Choose the initial game administrator independently from the login allowlist.

## 12. Phase 0 implementation record

- 2026-08-28: Supabase selected over Neon/Firebase.
- Supabase organization `LINE BREAKER` and Seoul development project `line-breaker-dev` created; status verified `ACTIVE_HEALTHY`.
- `db/index.ts` now targets Postgres.js/Drizzle with prepared statements disabled for Supavisor transaction pooling.
- Baseline schema covers `users`, `game_profiles`, `seasons`, `portfolios`, and immutable `cash_ledger`.
- Baseline migrations: `drizzle/0000_flippant_red_hulk.sql` and server-only RLS hardening in `drizzle/0001_fast_mephistopheles.sql`.
- Both baseline migrations were applied to the development project and all five tables were verified with RLS enabled.
- No production or preview database has been created or migrated.

## 13. Phase 1 implementation record

- 2026-08-28: added authenticated `GET /api/game/me` and `PUT /api/game/profile` routes.
- First league entry creates the Google-sub-based user, unique nickname profile, active-season portfolio, and KRW 100,000,000 seed ledger entry in one serializable transaction.
- `(season_id, user_id)` and `(portfolio_id, idempotency_key)` unique keys make retries idempotent; serialization failures retry up to three times.
- The API returns nickname and portfolio values only; email and Google `sub` are not exposed in the game payload.
- Added the responsive `선 넘는 리그` entry and nickname/rules onboarding dialog to the authenticated dashboard.
- Opened development-only `LINE BREAKER 프리시즌 2026`; Production remains untouched.
- Added `POST /api/admin/game/seasons`; authorization is based only on the database `admin` role, never the login email allowlist.
- Integration verification issued eight concurrent enrollment calls and confirmed exactly one user, profile, portfolio, and seed ledger entry, then removed the test account.
- Admin season-management UI and the first administrator assignment remain deferred until an administrator identity and Production database are approved. Development seasons can also use the guarded seed script.

## 14. Phase 2 implementation record

- 2026-08-28: added server-priced, immediate simulated buy/sell execution for Korean and US common stocks.
- The browser submits only symbol, market, side, whole-share quantity, and a client idempotency key. Price, FX, cash, and holdings are always selected and checked on the server.
- Added `orders`, `executions`, `positions`, `price_snapshots`, and `fx_snapshots` with RLS, positive-value checks, unique idempotency/execution constraints, and portfolio/symbol position uniqueness.
- `drizzle/0002_reflective_stellaris.sql` was applied to the Development Supabase project only. Production remains untouched.
- Cash and positions are updated with exact decimal arithmetic inside a serializable transaction. The portfolio and position are locked, and serialization failures retry up to three times.
- Replayed idempotency keys return the original receipt; a key reused for a different intent is rejected.
- Quotes older than eight days and FX snapshots older than five days are rejected. Every receipt records quote/FX sources and timestamps so delayed data is visible.
- Added authenticated `GET/POST /api/game/orders` and `GET /api/game/portfolio` routes plus holdings, recent fills, two-step trade confirmation, and server-calculated receipt UI.
- Development integration verification proved concurrent overspend and oversell protection, replay idempotency, exact USD/KRW conversion, stale-quote rejection, ledger reconciliation, and email omission; all test records are removed in `finally`.
- Phase 3 will add independently refreshed position valuation, leaderboard snapshots, public player portfolios, and activity. Until then, cached equity is updated from the latest execution and saved position snapshots.

## 15. Phase 3 implementation record

- 2026-08-28: added server-side KRW revaluation for every active-season portfolio and immutable leaderboard snapshots.
- `drizzle/0003_quiet_shaman.sql` adds `leaderboard_snapshots` with one row per portfolio/snapshot key, rank, cash/equity/market value, total return, cash ratio, cumulative maximum drawdown, valuation time, and oldest included quote time. RLS is enabled and the migration was applied to Development only.
- A refresh fetches server quotes for every distinct held security before the transaction. Missing, mismatched, stale, or recently-unreceived quote/FX data aborts the entire valuation; values never silently fall back to zero.
- The serializable refresh transaction takes a season advisory lock, locks all portfolios and positions, rejects changed projections, updates current valuations, and writes one common snapshot key. Ranking uses equity descending, cumulative maximum drawdown ascending, then join time ascending.
- Added authenticated `GET/POST /api/game/leaderboard`, `GET /api/game/players/:profileId`, and `GET /api/game/activity`. All public payloads use profile ID, nickname, and optional avatar; email and Google `sub` are omitted.
- Participant holdings are visible to authenticated league members. Recent trades and the common activity feed respect `activity_feed_visible`.
- Added `내 투자 / 순위 / 활동` tabs, explicit server-valuation refresh, snapshot timestamps, rank movement, lightweight badges, public participant holdings, and privacy copy.
- League security names are chart navigation targets: selecting a holding, fill, or public activity security closes the league dialog, opens that KR/US security in the main chart, and scrolls the chart into view. Participant-name actions remain separate from security navigation.
- Development integration verification created an isolated three-player season with KR and US positions, checked independently expected equity/rank movement, cumulative drawdown, ledger-to-cash reconciliation, feed opt-out, and email omission, then removed the test season and records.
- Phase 4 remains the production gate: rate limiting, observability, admin audit UI, accessibility/mobile interaction review, backup/recovery drill, and explicit Production database/deployment approval.

## 16. Phase 4 implementation record

- 2026-08-28: added database-backed fixed-window limits for simulated orders (12/minute), league valuation refreshes (2/5 minutes), and season creation (5/10 minutes). Actor keys are application-scoped SHA-256 values; raw Google `sub` and email are not stored in rate buckets.
- `drizzle/0004_shocking_silver_surfer.sql` adds RLS-protected `rate_limit_buckets` and `audit_events`. The migration was applied to Development only.
- Game mutation responses now include `x-request-id`; structured server logs use request IDs and safe event fields without session, email, Google `sub`, or request bodies.
- Administrator season creation and its `season.created` audit event commit in one transaction. Added an admin-only overview with seasons, participant counts, and recent audit records.
- Added an administrator-only `운영` tab with season status, safe draft/open season creation, and audit request IDs. The UI does not provide reset/delete behavior.
- Improved modal focus, search-option ARIA state, logo-dialog interaction semantics, small-screen admin/ranking layouts, and stale chart/search state handling. Generated deployment/build directories are excluded from lint.
- Full ESLint now passes with four existing image-optimization warnings and zero errors; build and nine contract/render tests pass.
- Development integration verification confirms atomic rate counters, window reset, role separation, atomic audit creation, request-ID propagation, and private-field omission, then removes all temporary data.
- The operational runbook is `.codex/notes/paper-trading-runbook.md`. Production backup/restore evidence, first admin assignment, authenticated browser/mobile review, correction workflow, season-close workflow, and explicit migration/deployment approval remain release blockers.
- A guarded, idempotent Development-only administrator bootstrap script now resolves an existing account by email for lookup only, assigns the role to its durable Google-sub-backed user row, and writes `user.admin_assigned` in the same transaction. The target email and Google `sub` are not persisted in audit metadata.
- The first assignment attempt for the designated owner found no Development league user row and rolled back without changes. The owner must sign in and open the league once so the normal Google-sub-based enrollment creates the account; then the guarded command can be rerun.
- Development preseason diagnosis found that successful trades refreshed only the personal portfolio in the client, leaving the in-memory leaderboard snapshot and activity tape stale. The trade flow now performs a read-only league/activity refresh after each fill without misreporting the completed trade as failed. Ranking and activity tab entry are read-only; the expensive common valuation runs only from the explicit `현재 시세로 갱신` button. A 429 response disables that button and displays the server-provided remaining wait time.
- 2026-08-28: created a separate Seoul Production Supabase project, applied migrations `0000` through `0005`, verified RLS on all 15 public tables, configured the Vercel Production pooler connection, and opened the private preseason. Production administrator assignment still requires the owner to enroll once through the deployed service.
- Production latency review found the Vercel function in `iad1` while Supabase runs in Seoul. Runtime placement is now pinned to `icn1`; the league shell renders after the profile response instead of waiting for all detail calls, and the admin overview is requested only for a confirmed database admin.

## 11. Out of scope for the first release

- real money, deposits, brokerage linkage, prizes, margin, shorting, options, crypto;
- fractional shares, limit/stop orders, dividends, corporate-action perfection;
- public unauthenticated portfolios;
- AI-generated investment recommendations.
