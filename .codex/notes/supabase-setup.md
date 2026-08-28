# Supabase setup and operations

## Current state

- Organization: `LINE BREAKER`
- Organization ID: `hjtptxxqjaggsrnkvcix`
- Target region: Seoul, `ap-northeast-2`
- Target plan: Free
- Development project: `line-breaker-dev` (`mligljkrwrcdslfbvqsz`), `ACTIVE_HEALTHY`
- Production project: not created or connected
- Authentication: keep existing Google OAuth; Supabase is DB/Realtime only
- Data API posture: all game tables have RLS enabled with no public policies; access is server-only

## Secrets

Never commit any of the following:

- Supabase personal access token;
- database password or `DATABASE_URL`;
- service-role or anon key.

The personal access token shared during setup was used only as process-local CLI input and was not written to the repository. Rotate it after setup because it appeared in chat history.

The generated development database password is stored only as the Vercel `Development` secret `DATABASE_URL`. Pull it locally only when needed with `npx vercel env pull .env.local --environment=development`; `.env.local` is gitignored.

## Connection choice

- Vercel runtime: Supavisor **transaction mode**, port `6543`; `prepare: false` is required by the application adapter.
- Drizzle migrations/administration: direct connection when available, otherwise a compatible session-pooler URL.
- TLS: `DATABASE_SSL=require` for hosted Supabase.
- Local PostgreSQL only: set `DATABASE_SSL=disable`.

## Environment variables

```text
DATABASE_URL=<secret Supabase Postgres URL>
DATABASE_SSL=require
```

Store these in `.env.local` for local development and as encrypted Vercel variables for Preview/Production. Do not use a `NEXT_PUBLIC_` prefix.

## Initial migration

```bash
npm run db:check
npm run db:generate
DATABASE_URL='<admin connection string>' npm run db:migrate
```

Before applying to Production:

1. apply to a fresh development database;
2. verify tables, foreign keys, checks, and unique indexes;
3. run account-seeding concurrency and reconciliation tests;
4. capture backup/recovery steps;
5. request explicit production migration approval.

## Applied development migrations

- `drizzle/0000_flippant_red_hulk.sql`: identity, profile, season, portfolio, and immutable cash ledger.
- `drizzle/0001_fast_mephistopheles.sql`: enables RLS on every game table with no public policies.
- `drizzle/0002_reflective_stellaris.sql`: Phase 2 orders, executions, positions, and timestamped price/FX snapshots with RLS and reconciliation constraints.
- `drizzle/0003_quiet_shaman.sql`: Phase 3 leaderboard snapshots, shared valuation timestamps, return/cash-ratio/drawdown checks, and RLS.
- `drizzle/0004_shocking_silver_surfer.sql`: Phase 4 database rate-limit buckets and immutable administrator audit events with RLS.

Remote verification on 2026-08-28 confirmed all thirteen tables exist and have `rowsecurity = true`.

## Development preseason and Phase 1 verification

The seed and integration scripts refuse to run unless their explicit safety flags are present. Run them with Vercel Development variables only:

```bash
ALLOW_DEV_SEED=true npx vercel env run -e development -- npm run db:seed:dev-season
ALLOW_PHASE1_DB_TEST=true npx vercel env run -e development -- npm run verify:phase1
ALLOW_PHASE2_DB_TEST=true npx vercel env run -e development -- npm run verify:phase2
ALLOW_PHASE3_DB_TEST=true npx vercel env run -e development -- npm run verify:phase3
ALLOW_PHASE4_DB_TEST=true npx vercel env run -e development -- npm run verify:phase4
```

The Phase 1 verification creates only a `phase1-test-*` account, sends eight concurrent first-entry requests, checks the one-portfolio/one-ledger invariants and private-field omission, and removes all test records in `finally`.

The Phase 2 verification uses a `phase2-test-*` account and injected deterministic quotes. It checks concurrent overspend and oversell protection, replay idempotency, exact USD/KRW conversion, stale quote rejection, ledger reconciliation, private-field omission, and cleanup. Both safety flags and Vercel Development variables are mandatory; never point these commands at Production.

The Phase 3 verification creates an isolated `phase3-*` development season and three temporary participants. It verifies mixed KR/US valuation, rank movement, cumulative drawdown, ledger-to-cash reconciliation, activity opt-out, email omission, and cleanup. The safety flag and Vercel Development environment are mandatory.

The Phase 4 verification creates temporary administrator and participant identities plus a draft season. It checks atomic database rate limits, administrator separation, audit creation in the season transaction, request-ID propagation, private-field omission, and cleanup.
