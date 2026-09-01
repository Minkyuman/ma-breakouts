# Project state — LINE BREAKER

> Read this at the start of a resumed session. Confirm it with the current code, `git status --short`, and the deployment state before acting.

**Updated:** 2026-08-30

## Project

LINE BREAKER is a Google-login-gated Korean and U.S. moving-average breakout screener. It provides daily/weekly/monthly charts, MA5/MA10/MA240, favorites, an AI stock-analysis dialog, and the season-based `선 넘는 리그` paper-trading feature. Production is Vercel; league persistence uses server-only Supabase Postgres with Drizzle.

## Current state

- Production URL: `https://stock-chart-screener-web.vercel.app`.
- The latest confirmed application work added AI analysis with OpenRouter, Korean verified finance/supply/consensus data when available, and explicit weekly/monthly MA10/MA240 priority in the analysis prompt.
- Korean ETFs with six-character alphanumeric codes are supported by chart and analysis validation (for example `0117V0` and `0101N0`).
- Detail views opened from favorites or league holdings hydrate market metadata so market cap and ETF/ETN badges can be shown. AI analysis also includes a market-cap summary when available.
- League player details calculate cash ratio from a single stored basis: current cash divided by current cash plus stored holding market value. Ranking order remains based on the latest common server valuation snapshot.
- There are uncommitted application, schema, migration, test, README, and deployment-config changes. Preserve them; inspect the diff before editing or committing.

## Active work and follow-up

- No production migration is pending by default. `drizzle/0007_late_ben_grimm.sql` adds persistent AI analysis-model settings. Apply it only with explicit user approval and the documented migration procedure.
- If the administrator model-setting UI reports a missing `analysis_settings` table, verify the production migration status instead of changing runtime fallback behavior blindly.
- AI analysis is cached in-process for 30 minutes. Provider or web-search failures retry once with the server-collected Fact Pack; avoid exposing model/API keys in logs or UI.
- Recent application validation passed `npm test` (13 tests) and `npm run lint` with four existing image-element warnings and no lint errors. Re-run relevant checks after further changes.

## Durable decisions

- MA10 and MA240 on weekly and monthly charts are the product's primary technical signals. When they conflict, analysis must prefer caution and risk management over chase-buy recommendations.
- Google `sub` is the durable paper-trading identity. Public league responses use nickname/profile ID and optional avatar only; email is never public.
- Browser-submitted price, FX, cash, P&L, rank, and equity are never trusted. Executions and the cash ledger are canonical; positions and leaderboard snapshots are projections.
- Korean stocks and ETFs are eligible for league trading; ETNs are favorites-only. U.S. common stocks are eligible under the current provider scope.
- Production deploys, database migrations, season resets, paid infrastructure, and destructive repairs require explicit user authorization.

## Resume checklist

1. Read root `AGENTS.md`; read `.codex/notes/paper-trading.md` for league work.
2. Run `git status --short` and inspect only the relevant diff.
3. Read [self-check.md](self-check.md) and [workflows.md](workflows.md) before choosing commands.
4. For a deployment, confirm explicit user authorization, validate the requested scope, deploy to Vercel, and verify the production alias.
