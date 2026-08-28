CREATE TYPE "public"."ledger_entry_type" AS ENUM('season_seed', 'trade_settlement', 'correction');--> statement-breakpoint
CREATE TYPE "public"."season_status" AS ENUM('draft', 'open', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('participant', 'admin');--> statement-breakpoint
CREATE TABLE "cash_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount_krw" numeric(20, 2) NOT NULL,
	"balance_after_krw" numeric(20, 2) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_ledger_amount_nonzero" CHECK ("cash_ledger"."amount_krw" <> 0),
	CONSTRAINT "cash_ledger_balance_nonnegative" CHECK ("cash_ledger"."balance_after_krw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "game_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nickname" varchar(32) NOT NULL,
	"activity_feed_visible" boolean DEFAULT true NOT NULL,
	"accepted_rules_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_profiles_rules_version_positive" CHECK ("game_profiles"."accepted_rules_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cash_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"equity_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolios_cash_nonnegative" CHECK ("portfolios"."cash_krw" >= 0),
	CONSTRAINT "portfolios_equity_nonnegative" CHECK ("portfolios"."equity_krw" >= 0),
	CONSTRAINT "portfolios_version_nonnegative" CHECK ("portfolios"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" "season_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"initial_cash_krw" numeric(20, 2) DEFAULT '100000000.00' NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_valid_window" CHECK ("seasons"."ends_at" > "seasons"."starts_at"),
	CONSTRAINT "seasons_initial_cash_positive" CHECK ("seasons"."initial_cash_krw" > 0),
	CONSTRAINT "seasons_rule_version_positive" CHECK ("seasons"."rule_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'participant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_profiles" ADD CONSTRAINT "game_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_ledger_portfolio_idempotency_unique" ON "cash_ledger" USING btree ("portfolio_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cash_ledger_portfolio_created_idx" ON "cash_ledger" USING btree ("portfolio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_profiles_user_unique" ON "game_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_profiles_nickname_unique" ON "game_profiles" USING btree ("nickname");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_season_user_unique" ON "portfolios" USING btree ("season_id","user_id");--> statement-breakpoint
CREATE INDEX "portfolios_season_equity_idx" ON "portfolios" USING btree ("season_id","equity_krw");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_slug_unique" ON "seasons" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "seasons_status_dates_idx" ON "seasons" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_unique" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");