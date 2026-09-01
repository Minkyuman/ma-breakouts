# Workflows

## Matrix

| Work | Read first | Required safeguards |
| --- | --- | --- |
| Screener, chart, search, favorites, or AI analysis | `AGENTS.md`, [project state](project-state.md), relevant code and tests | Preserve Google-login gate; keep secrets server-only; run application checks. |
| League UI or trade domain | `.codex/notes/paper-trading.md`, local `paper-trading-builder` skill | Follow identity, decimal, ledger, transaction, idempotency, privacy, and quote/FX rules. |
| Schema or migration | `.codex/notes/supabase-setup.md`, `.codex/notes/paper-trading-runbook.md` | Develop/test first; never migrate Production without explicit approval. |
| Production deployment | this file and [self-check](self-check.md) | User must explicitly request it; never include secrets in output. |

## Application change

1. Inspect the affected API, UI, and tests; keep unrelated dirty work intact.
2. Make the smallest scoped change and add a regression test for a fixed bug or invariant.
3. Run `npm test`, `npm run lint` for code changes, and `git diff --check`.
4. Deploy only when the user explicitly asks. Verify the Vercel production alias after deployment.

## Paper-trading change

1. Name the user-visible result and acceptance criteria.
2. Read `.codex/notes/paper-trading.md` and `.agents/skills/paper-trading-builder/SKILL.md` fully.
3. Keep money and portfolio mutations in a single serializable transaction with an idempotency key; use decimal-safe values and server-selected quote/FX data.
4. Add/update the applicable contract and Development integration checks.
5. Update the paper-trading note only when a durable decision, completed milestone, or blocker changed.

## Database migration and release

1. Confirm the target environment and explicit authorization for a Production migration.
2. Follow the backup, dry-run, and verification gates in `.codex/notes/paper-trading-runbook.md`.
3. Run `npm run db:check`, application checks, and relevant Development integrations before Production.
4. Use `RUN_DB_MIGRATIONS=true` only for the approved production deployment; remove the flag afterward.
5. Confirm RLS, migration result, and server-only environment-variable posture without printing credentials.
