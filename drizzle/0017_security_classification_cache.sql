CREATE TABLE IF NOT EXISTS "security_classification_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "market" varchar(16) NOT NULL,
  "code" varchar(16) NOT NULL,
  "security_name" varchar(160) NOT NULL,
  "asset_type" varchar(8) NOT NULL,
  "sector" varchar(160),
  "industry" varchar(160),
  "themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "provider" varchar(32) DEFAULT 'nasdaq' NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "security_classification_cache_market_code_unique" ON "security_classification_cache" USING btree ("market","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "security_classification_cache_fetched_idx" ON "security_classification_cache" USING btree ("fetched_at");
--> statement-breakpoint
ALTER TABLE "security_classification_cache" ENABLE ROW LEVEL SECURITY;
