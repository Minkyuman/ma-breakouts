# LINE BREAKER League operations runbook

Last updated: 2026-08-28  
Scope: private preseason and production-readiness checks. This document does not authorize a Production migration, deploy, season reset, or destructive repair.

## 1. Release gates

Before the first Production migration:

1. Create a separate Production Supabase project and record its region/project reference without placing credentials in Git.
2. Capture a schema-only and data backup from the target before every migration. Verify the backup can be listed and restored into a disposable database.
3. Apply all migrations to a fresh disposable database, then Development, before Production.
4. Run `npm test`, `npm run lint`, `npm run db:check`, and the Phase 1–4 integration scripts against non-production data.
5. Confirm Google OAuth redirect URIs, allowlist, server-only `DATABASE_URL`, and RLS on every game table.
6. Assign the first administrator by durable Google `sub` through an audited, one-time server-side procedure. The login allowlist is not an admin role.
7. Run a private preseason with no prizes. Confirm delayed-quote disclosure on every trade surface.
8. Obtain explicit approval immediately before Production migration and deployment.

## 2. Backup and recovery drill

Use the provider-supported backup/export path or `pg_dump` with a direct/session connection. Never paste the database URL into shell history or documentation.

Required evidence:

- backup timestamp, database project/environment, migration journal version, and encrypted storage location;
- restore into a disposable database;
- row counts for all game tables;
- cash reconciliation: `sum(cash_ledger.amount_krw) = portfolios.cash_krw` per portfolio;
- execution/order one-to-one reconciliation and nonnegative positions;
- latest leaderboard recomputation matches its snapshot.

Recovery order:

1. stop mutations by disabling game write routes or closing the active season;
2. preserve request IDs and logs around the incident window;
3. restore to a new database, never over the only copy;
4. run reconciliation and privacy checks;
5. switch the server-only connection only after verification and approval;
6. record the change as an audit event and publish a participant-facing incident note when relevant.

## 3. Monitoring and request tracing

Mutation responses include `x-request-id`. Structured logs use `service=line-breaker-game` and events including:

- `order.filled`, `order.rejected`, `order.failed`;
- `valuation.completed`, `valuation.rejected`, `valuation.failed`;
- `admin.season_created`, `admin.season_rejected`, `admin.season_failed`.

Alert candidates for the private preseason:

- repeated `order.failed` or `valuation.failed` within five minutes;
- HTTP 503 rate above 2% of game requests;
- sustained HTTP 429 responses from one action;
- any negative cash/quantity constraint failure;
- reconciliation mismatch or missing quote/FX timestamps;
- audit event without a request ID.

Do not log session cookies, Google `sub`, email, database errors containing connection strings, or full request bodies.

The guarded Development bootstrap command is `npm run db:assign:dev-admin`. It requires `ALLOW_DEV_ADMIN_ASSIGNMENT=true`, `TARGET_ADMIN_EMAIL`, and `EXPECTED_DEV_PROJECT_REF`; the email is lookup input only and is excluded from audit metadata. Run it only through the Vercel Development environment. The target must first open the league so normal Google-sub-based enrollment has created its user row; the script never fabricates or guesses a Google identity.

## 4. Rate-limit operations

Current Development policy:

- simulated orders: 12 per user per 60 seconds;
- league valuation refresh: 2 per user per 300 seconds;
- season creation: 5 per administrator per 600 seconds.

Actors are stored as a SHA-256 application-scoped key, not email or raw Google `sub`. Expired buckets are disposable operational data. Delete only rows whose `expires_at` is safely in the past, using an explicit timestamp and environment check; never truncate the table as part of normal operation.

## 5. Incident playbooks

### Quote or FX outage

- Expect orders/valuations to fail closed with 503; never substitute zero or a browser price.
- Check the request ID and quote source status.
- Keep prior snapshots visible with their timestamps.
- Resume only when freshness checks pass.

### Suspected duplicate or incorrect execution

- Do not edit or delete the execution or ledger row.
- Compare the client idempotency key, order, execution, and ledger reference.
- If a correction is approved, append a compensating ledger entry and audit event in one transaction; the correction flow is not yet implemented.

### Cash or position mismatch

- Stop game mutations.
- Rebuild from immutable executions and cash ledger in a disposable copy.
- Do not patch cached portfolio/position values before identifying the cause.
- Restore or apply an audited compensating correction only after review.

### Season lifecycle error

- Never reset by deleting an existing season.
- Close the incorrect season and create a new season/portfolio set after approval.
- Historical executions, ledgers, and snapshots remain immutable.

## 6. Known release blockers

- Production Supabase and initial migrations are complete. A backup/restore drill after real participant data exists and the first Production admin assignment remain pending.
- Correction workflow and season-close UI are not implemented.
- Automated browser testing could not run without a connected browser; authenticated mobile tap/keyboard review remains a manual gate.
- Exchange-grade real-time fairness is not available. A prize-bearing season requires batch settlement or a licensed quote policy decision.
