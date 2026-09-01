import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("uses Supabase-compatible PostgreSQL without exposing a client key", async () => {
  const [adapter, config, envExample] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(adapter, /drizzle-orm\/postgres-js/);
  assert.match(adapter, /prepare:\s*false/);
  assert.match(adapter, /process\.env\.DATABASE_URL/);
  assert.match(config, /dialect:\s*"postgresql"/);
  assert.match(envExample, /^DATABASE_URL=$/m);
  assert.doesNotMatch(envExample, /sbp_|service_role|postgres(?:ql)?:\/\/.+@/i);
  assert.doesNotMatch(adapter, /NEXT_PUBLIC_|SUPABASE_ANON_KEY/);
});

test("baseline league migration enforces identity, seed, and ledger invariants", async () => {
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const migration = (
    await Promise.all(
      migrationFiles.map((name) =>
        readFile(new URL(name, migrationDirectory), "utf8")
      )
    )
  ).join("\n");

  for (const table of [
    "users",
    "game_profiles",
    "seasons",
    "portfolios",
    "cash_ledger",
    "orders",
    "executions",
    "positions",
    "price_snapshots",
    "fx_snapshots",
    "leaderboard_snapshots",
    "rate_limit_buckets",
    "audit_events",
    "favorite_lists",
    "favorite_list_items",
    "analysis_settings",
    "access_requests",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(migration, /users_google_sub_unique/);
  assert.match(migration, /portfolios_season_user_unique/);
  assert.match(migration, /cash_ledger_portfolio_idempotency_unique/);
  assert.match(migration, /cash_ledger_balance_nonnegative/);
  assert.match(migration, /orders_portfolio_client_unique/);
  assert.match(migration, /executions_order_unique/);
  assert.match(migration, /positions_portfolio_symbol_market_unique/);
  assert.match(migration, /positions_quantity_nonnegative/);
  assert.match(migration, /price_snapshots_source_quote_unique/);
  assert.match(migration, /fx_snapshots_source_quote_unique/);
  assert.match(migration, /leaderboard_snapshots_key_portfolio_unique/);
  assert.match(migration, /leaderboard_snapshots_drawdown_valid/);
  assert.match(migration, /rate_limit_buckets_actor_action_window_unique/);
  assert.match(migration, /audit_events_actor_created_idx/);
  assert.match(migration, /access_requests_google_sub_unique/);
  assert.match(migration, /access_requests_email_unique/);
  assert.match(migration, /initial_cash_krw.+100000000\.00/s);
  for (const table of [
    "users",
    "game_profiles",
    "seasons",
    "portfolios",
    "cash_ledger",
    "orders",
    "executions",
    "positions",
    "price_snapshots",
    "fx_snapshots",
    "leaderboard_snapshots",
    "rate_limit_buckets",
    "audit_events",
    "favorite_lists",
    "favorite_list_items",
    "analysis_settings",
    "access_requests",
  ]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
    );
  }
  assert.doesNotMatch(migration, /DROP TABLE|DROP TYPE/);
});
