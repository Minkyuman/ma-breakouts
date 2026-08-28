import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["participant", "admin"]);
export const seasonStatus = pgEnum("season_status", [
  "draft",
  "open",
  "closed",
  "archived",
]);
export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "season_seed",
  "trade_settlement",
  "correction",
]);
export const orderSide = pgEnum("order_side", ["buy", "sell"]);
export const orderStatus = pgEnum("order_status", ["filled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("participant"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_google_sub_unique").on(table.googleSub),
    index("users_email_idx").on(table.email),
  ]
).enableRLS();

export const gameProfiles = pgTable(
  "game_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(),
    activityFeedVisible: boolean("activity_feed_visible")
      .notNull()
      .default(true),
    acceptedRulesVersion: integer("accepted_rules_version")
      .notNull()
      .default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("game_profiles_user_unique").on(table.userId),
    uniqueIndex("game_profiles_nickname_unique").on(table.nickname),
    check(
      "game_profiles_rules_version_positive",
      sql`${table.acceptedRulesVersion} > 0`
    ),
  ]
).enableRLS();

export const favoriteLists = pgTable(
  "favorite_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("favorite_lists_user_name_unique").on(table.userId, table.name),
    index("favorite_lists_user_sort_idx").on(table.userId, table.sortOrder, table.createdAt),
    check("favorite_lists_sort_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
).enableRLS();

export const favoriteListItems = pgTable(
  "favorite_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => favoriteLists.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    securityName: varchar("security_name", { length: 160 }).notNull(),
    market: varchar("market", { length: 16 }).notNull(),
    nativeCurrency: varchar("native_currency", { length: 3 }).notNull(),
    assetType: varchar("asset_type", { length: 8 }).notNull().default("STOCK"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("favorite_list_items_security_unique").on(table.listId, table.symbol, table.market),
    index("favorite_list_items_list_sort_idx").on(table.listId, table.sortOrder, table.createdAt),
    check("favorite_list_items_sort_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
).enableRLS();

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    status: seasonStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    initialCashKrw: numeric("initial_cash_krw", {
      precision: 20,
      scale: 2,
    })
      .notNull()
      .default("100000000.00"),
    ruleVersion: integer("rule_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("seasons_slug_unique").on(table.slug),
    index("seasons_status_dates_idx").on(
      table.status,
      table.startsAt,
      table.endsAt
    ),
    check("seasons_valid_window", sql`${table.endsAt} > ${table.startsAt}`),
    check("seasons_initial_cash_positive", sql`${table.initialCashKrw} > 0`),
    check("seasons_rule_version_positive", sql`${table.ruleVersion} > 0`),
  ]
).enableRLS();

export const portfolios = pgTable(
  "portfolios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cashKrw: numeric("cash_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    equityKrw: numeric("equity_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    version: integer("version").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("portfolios_season_user_unique").on(
      table.seasonId,
      table.userId
    ),
    index("portfolios_season_equity_idx").on(
      table.seasonId,
      table.equityKrw
    ),
    check("portfolios_cash_nonnegative", sql`${table.cashKrw} >= 0`),
    check("portfolios_equity_nonnegative", sql`${table.equityKrw} >= 0`),
    check("portfolios_version_nonnegative", sql`${table.version} >= 0`),
  ]
).enableRLS();

export const cashLedger = pgTable(
  "cash_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    entryType: ledgerEntryType("entry_type").notNull(),
    amountKrw: numeric("amount_krw", { precision: 20, scale: 2 }).notNull(),
    balanceAfterKrw: numeric("balance_after_krw", {
      precision: 20,
      scale: 2,
    }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cash_ledger_portfolio_idempotency_unique").on(
      table.portfolioId,
      table.idempotencyKey
    ),
    index("cash_ledger_portfolio_created_idx").on(
      table.portfolioId,
      table.createdAt
    ),
    check("cash_ledger_amount_nonzero", sql`${table.amountKrw} <> 0`),
    check(
      "cash_ledger_balance_nonnegative",
      sql`${table.balanceAfterKrw} >= 0`
    ),
  ]
).enableRLS();

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    securityName: varchar("security_name", { length: 160 }).notNull(),
    market: varchar("market", { length: 16 }).notNull(),
    side: orderSide("side").notNull(),
    quantity: integer("quantity").notNull(),
    tradeNote: varchar("trade_note", { length: 200 }),
    status: orderStatus("status").notNull().default("filled"),
    clientOrderId: varchar("client_order_id", { length: 128 }).notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_portfolio_client_unique").on(
      table.portfolioId,
      table.clientOrderId,
    ),
    index("orders_portfolio_created_idx").on(table.portfolioId, table.createdAt),
    check("orders_quantity_positive", sql`${table.quantity} > 0`),
  ],
).enableRLS();

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    nativePrice: numeric("native_price", { precision: 20, scale: 6 }).notNull(),
    nativeCurrency: varchar("native_currency", { length: 3 }).notNull(),
    fxRate: numeric("fx_rate", { precision: 20, scale: 8 }).notNull(),
    grossKrw: numeric("gross_krw", { precision: 20, scale: 2 }).notNull(),
    feeKrw: numeric("fee_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    cashDeltaKrw: numeric("cash_delta_krw", { precision: 20, scale: 2 }).notNull(),
    quoteSource: varchar("quote_source", { length: 80 }).notNull(),
    quoteAt: timestamp("quote_at", { withTimezone: true }).notNull(),
    quoteReceivedAt: timestamp("quote_received_at", { withTimezone: true }).notNull(),
    fxSource: varchar("fx_source", { length: 80 }).notNull(),
    fxAt: timestamp("fx_at", { withTimezone: true }).notNull(),
    fxReceivedAt: timestamp("fx_received_at", { withTimezone: true }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("executions_order_unique").on(table.orderId),
    check("executions_quantity_positive", sql`${table.quantity} > 0`),
    check("executions_native_price_positive", sql`${table.nativePrice} > 0`),
    check("executions_fx_rate_positive", sql`${table.fxRate} > 0`),
    check("executions_gross_positive", sql`${table.grossKrw} > 0`),
    check("executions_fee_nonnegative", sql`${table.feeKrw} >= 0`),
    check("executions_cash_delta_nonzero", sql`${table.cashDeltaKrw} <> 0`),
    check("executions_rule_version_positive", sql`${table.ruleVersion} > 0`),
  ],
).enableRLS();

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    securityName: varchar("security_name", { length: 160 }).notNull(),
    market: varchar("market", { length: 16 }).notNull(),
    nativeCurrency: varchar("native_currency", { length: 3 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    averageCostKrw: numeric("average_cost_krw", { precision: 20, scale: 6 })
      .notNull()
      .default("0.000000"),
    realizedPnlKrw: numeric("realized_pnl_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    lastNativePrice: numeric("last_native_price", { precision: 20, scale: 6 }).notNull(),
    lastFxRate: numeric("last_fx_rate", { precision: 20, scale: 8 }).notNull(),
    marketValueKrw: numeric("market_value_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    unrealizedPnlKrw: numeric("unrealized_pnl_krw", { precision: 20, scale: 2 })
      .notNull()
      .default("0.00"),
    lastQuotedAt: timestamp("last_quoted_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("positions_portfolio_symbol_market_unique").on(
      table.portfolioId,
      table.symbol,
      table.market,
    ),
    index("positions_portfolio_value_idx").on(table.portfolioId, table.marketValueKrw),
    check("positions_quantity_nonnegative", sql`${table.quantity} >= 0`),
    check("positions_average_cost_nonnegative", sql`${table.averageCostKrw} >= 0`),
    check("positions_market_value_nonnegative", sql`${table.marketValueKrw} >= 0`),
    check("positions_version_nonnegative", sql`${table.version} >= 0`),
  ],
).enableRLS();

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: varchar("symbol", { length: 16 }).notNull(),
    market: varchar("market", { length: 16 }).notNull(),
    nativeCurrency: varchar("native_currency", { length: 3 }).notNull(),
    nativePrice: numeric("native_price", { precision: 20, scale: 6 }).notNull(),
    source: varchar("source", { length: 80 }).notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("price_snapshots_source_quote_unique").on(
      table.symbol,
      table.market,
      table.source,
      table.quotedAt,
    ),
    index("price_snapshots_symbol_received_idx").on(table.symbol, table.receivedAt),
    check("price_snapshots_price_positive", sql`${table.nativePrice} > 0`),
  ],
).enableRLS();

export const fxSnapshots = pgTable(
  "fx_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
    source: varchar("source", { length: 80 }).notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("fx_snapshots_source_quote_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.source,
      table.quotedAt,
    ),
    index("fx_snapshots_pair_received_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.receivedAt,
    ),
    check("fx_snapshots_rate_positive", sql`${table.rate} > 0`),
  ],
).enableRLS();

export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotKey: uuid("snapshot_key").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    equityKrw: numeric("equity_krw", { precision: 20, scale: 2 }).notNull(),
    cashKrw: numeric("cash_krw", { precision: 20, scale: 2 }).notNull(),
    marketValueKrw: numeric("market_value_krw", { precision: 20, scale: 2 }).notNull(),
    totalReturnPct: numeric("total_return_pct", { precision: 14, scale: 6 }).notNull(),
    cashRatioPct: numeric("cash_ratio_pct", { precision: 14, scale: 6 }).notNull(),
    maxDrawdownPct: numeric("max_drawdown_pct", { precision: 14, scale: 6 }).notNull(),
    valuationAt: timestamp("valuation_at", { withTimezone: true }).notNull(),
    oldestQuoteAt: timestamp("oldest_quote_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("leaderboard_snapshots_key_portfolio_unique").on(
      table.snapshotKey,
      table.portfolioId,
    ),
    index("leaderboard_snapshots_season_created_idx").on(
      table.seasonId,
      table.createdAt,
    ),
    index("leaderboard_snapshots_portfolio_created_idx").on(
      table.portfolioId,
      table.createdAt,
    ),
    check("leaderboard_snapshots_rank_positive", sql`${table.rank} > 0`),
    check("leaderboard_snapshots_equity_nonnegative", sql`${table.equityKrw} >= 0`),
    check("leaderboard_snapshots_cash_nonnegative", sql`${table.cashKrw} >= 0`),
    check("leaderboard_snapshots_market_value_nonnegative", sql`${table.marketValueKrw} >= 0`),
    check("leaderboard_snapshots_cash_ratio_valid", sql`${table.cashRatioPct} >= 0 AND ${table.cashRatioPct} <= 100`),
    check("leaderboard_snapshots_drawdown_valid", sql`${table.maxDrawdownPct} >= 0 AND ${table.maxDrawdownPct} <= 100`),
  ],
).enableRLS();

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorKey: varchar("actor_key", { length: 64 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_actor_action_window_unique").on(
      table.actorKey,
      table.action,
      table.windowStartedAt,
    ),
    index("rate_limit_buckets_expires_idx").on(table.expiresAt),
    check("rate_limit_buckets_count_positive", sql`${table.requestCount} > 0`),
    check("rate_limit_buckets_valid_window", sql`${table.expiresAt} > ${table.windowStartedAt}`),
  ],
).enableRLS();

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: uuid("target_id"),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_created_idx").on(table.createdAt),
    index("audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId),
  ],
).enableRLS();
