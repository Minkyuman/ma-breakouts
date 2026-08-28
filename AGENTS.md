# LINE BREAKER repository guide

## Start here

- Read `.codex/notes/paper-trading.md` before changing the paper-trading feature.
- Use `.agents/skills/paper-trading-builder/SKILL.md` for planning, schema, order execution, portfolio, leaderboard, or season work.
- Preserve the existing Korean/US screener and Google-login gate unless the task explicitly changes them.

## Non-negotiable paper-trading rules

- Identify a person by the Google `sub` claim. Email is an allowlist/contact attribute, not the durable primary key.
- Never accept price, FX rate, cash, profit, rank, or portfolio value from the browser as truth.
- Execute every cash/position mutation in one database transaction with an idempotency key.
- Treat executions and the cash ledger as canonical. Positions and leaderboard snapshots are rebuildable projections.
- Store the quote timestamp, quote source, native currency, FX snapshot, and rule/fee snapshot used for every execution.
- Use decimal-safe database types; do not calculate money with JavaScript floating-point values.
- Do not expose participant email addresses. Public game identity is a nickname plus optional avatar.
- Do not run a production migration, provision paid infrastructure, reset a season, or deploy without an explicit user request.

## Working method

1. Name the milestone and its acceptance criteria before editing.
2. Inspect overlapping user changes and keep unrelated work intact.
3. Add or update tests for business invariants before considering a milestone complete.
4. Run targeted tests, then `npm test`; run `npm run lint` when application code changes.
5. Run `.agents/skills/paper-trading-builder/scripts/validate_harness.sh` when domain rules or harness files change.
6. Record durable decisions and blockers in `.codex/notes/paper-trading.md`.

## Current architecture decision

- Production target: Supabase Free Postgres in Seoul (`ap-northeast-2`) with Drizzle migrations and the Supavisor transaction pooler for Vercel.
- Keep the existing Google OAuth/session implementation; Supabase is the database provider, not the user-facing authentication provider.
- Existing Cloudflare D1/SQLite files are starter scaffolding and must not be extended for the production game without an explicit architecture change.
- Never commit `SUPABASE_ACCESS_TOKEN`, database passwords, `DATABASE_URL`, service-role keys, or anon keys.
