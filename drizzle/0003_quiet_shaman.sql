CREATE TABLE "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_key" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"equity_krw" numeric(20, 2) NOT NULL,
	"cash_krw" numeric(20, 2) NOT NULL,
	"market_value_krw" numeric(20, 2) NOT NULL,
	"total_return_pct" numeric(14, 6) NOT NULL,
	"cash_ratio_pct" numeric(14, 6) NOT NULL,
	"max_drawdown_pct" numeric(14, 6) NOT NULL,
	"valuation_at" timestamp with time zone NOT NULL,
	"oldest_quote_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_snapshots_rank_positive" CHECK ("leaderboard_snapshots"."rank" > 0),
	CONSTRAINT "leaderboard_snapshots_equity_nonnegative" CHECK ("leaderboard_snapshots"."equity_krw" >= 0),
	CONSTRAINT "leaderboard_snapshots_cash_nonnegative" CHECK ("leaderboard_snapshots"."cash_krw" >= 0),
	CONSTRAINT "leaderboard_snapshots_market_value_nonnegative" CHECK ("leaderboard_snapshots"."market_value_krw" >= 0),
	CONSTRAINT "leaderboard_snapshots_cash_ratio_valid" CHECK ("leaderboard_snapshots"."cash_ratio_pct" >= 0 AND "leaderboard_snapshots"."cash_ratio_pct" <= 100),
	CONSTRAINT "leaderboard_snapshots_drawdown_valid" CHECK ("leaderboard_snapshots"."max_drawdown_pct" >= 0 AND "leaderboard_snapshots"."max_drawdown_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_key_portfolio_unique" ON "leaderboard_snapshots" USING btree ("snapshot_key","portfolio_id");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_season_created_idx" ON "leaderboard_snapshots" USING btree ("season_id","created_at");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_portfolio_created_idx" ON "leaderboard_snapshots" USING btree ("portfolio_id","created_at");