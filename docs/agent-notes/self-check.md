# Self-check

Run checks from the repository root. Select only the checks relevant to the change.

## Application changes

| Command | Use when | Success criterion |
| --- | --- | --- |
| `npm test` | Any application/API/UI/library change | Build completes and all Node contract/render tests pass. This command already runs `npm run build`. |
| `npm run lint` | TypeScript, React, CSS, API, or library changes | No ESLint errors. Existing `img` optimization warnings may remain unless the task changes those elements. |
| `git diff --check` | Any edited text or code | No whitespace errors. |

## Database and league changes

| Command | Use when | Success criterion |
| --- | --- | --- |
| `npm run db:check` | Drizzle schema or migration changes | Drizzle reports a consistent schema/migration state. |
| `.agents/skills/paper-trading-builder/scripts/validate_harness.sh` | Paper-trading rules or its local harness files change | Prints `paper-trading harness: OK`. |
| `ALLOW_PHASE1_DB_TEST=true npx vercel env run -e development -- npm run verify:phase1` | Identity, enrollment, seed-money changes | Development-only integration check passes and cleans up. |
| `ALLOW_PHASE2_DB_TEST=true npx vercel env run -e development -- npm run verify:phase2` | Orders, executions, cash, positions, quote/FX changes | Development-only integration check passes and cleans up. |
| `ALLOW_PHASE3_DB_TEST=true npx vercel env run -e development -- npm run verify:phase3` | Valuation, ranking, player detail, activity changes | Development-only integration check passes and cleans up. |
| `ALLOW_PHASE4_DB_TEST=true npx vercel env run -e development -- npm run verify:phase4` | Rate-limit, admin, audit, operational changes | Development-only integration check passes and cleans up. |

Never point the flagged integration commands at Production.

## Release verification

After explicit deployment approval, use `npx vercel --prod --yes` from the repository root. Confirm the resulting deployment is `Ready` and aliases `https://stock-chart-screener-web.vercel.app`. Run a read-only HTTP health check afterward. Production database migration requires separate explicit approval and `RUN_DB_MIGRATIONS=true`; turn that flag off after the one-time migration.
