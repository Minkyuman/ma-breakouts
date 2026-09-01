CREATE TABLE "market_search_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(16) NOT NULL,
	"normalized_name" varchar(160) NOT NULL,
	"security_name" varchar(160) NOT NULL,
	"market" varchar(16) NOT NULL,
	"asset_type" varchar(8) NOT NULL,
	"market_cap" double precision DEFAULT 0 NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"currency" varchar(3),
	"source_updated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_search_index_code_nonempty" CHECK (length(trim("market_search_index"."code")) > 0),
	CONSTRAINT "market_search_index_name_nonempty" CHECK (length(trim("market_search_index"."security_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "market_search_index" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "market_search_index_market_code_unique" ON "market_search_index" USING btree ("market","code");--> statement-breakpoint
CREATE INDEX "market_search_index_name_idx" ON "market_search_index" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "market_search_index_source_updated_idx" ON "market_search_index" USING btree ("source_updated_at");