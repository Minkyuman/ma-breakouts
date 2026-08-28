# Harness context snapshot

Date: 2026-08-28

- App: LINE BREAKER, a Vinext/React Korean and US moving-average breakout screener.
- Access: Google login plus `AUTH_ALLOWED_EMAILS`; the session exposes Google `sub`.
- Hosting: Vercel production.
- Persistence at task start: Drizzle packages existed, but `db/index.ts` targeted Cloudflare D1 and `db/schema.ts` was empty. Phase 0 now targets Supabase Postgres.
- Requested capability: allocate cyber money to registered accounts, simulate investments, rank users, and show their invested stocks.
- Constraints: do not expose emails, do not trust client price/balance, preserve the screener, and do not provision/deploy production infrastructure during planning.
- Harness mode: single primary agent by default. No custom sub-agent or plugin is justified yet.
