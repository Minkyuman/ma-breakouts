CREATE TABLE IF NOT EXISTS "us_monthly_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "market" varchar(16) NOT NULL,
  "code" varchar(16) NOT NULL,
  "period" date NOT NULL,
  "open" double precision NOT NULL,
  "high" double precision NOT NULL,
  "low" double precision NOT NULL,
  "close" double precision NOT NULL,
  "volume" double precision DEFAULT 0 NOT NULL,
  "source" varchar(32) DEFAULT 'nasdaq' NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "us_monthly_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "us_monthly_history_market_code_period_unique" ON "us_monthly_history" USING btree ("market","code","period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "us_monthly_history_code_period_idx" ON "us_monthly_history" USING btree ("market","code","period");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "us_weekly_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "market" varchar(16) NOT NULL,
  "code" varchar(16) NOT NULL,
  "period" date NOT NULL,
  "open" double precision NOT NULL,
  "high" double precision NOT NULL,
  "low" double precision NOT NULL,
  "close" double precision NOT NULL,
  "volume" double precision DEFAULT 0 NOT NULL,
  "source" varchar(32) DEFAULT 'nasdaq' NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "us_weekly_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "us_weekly_history_market_code_period_unique" ON "us_weekly_history" USING btree ("market","code","period");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "us_weekly_history_code_period_idx" ON "us_weekly_history" USING btree ("market","code","period");
