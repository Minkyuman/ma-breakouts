CREATE TYPE "public"."order_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('filled');--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"native_price" numeric(20, 6) NOT NULL,
	"native_currency" varchar(3) NOT NULL,
	"fx_rate" numeric(20, 8) NOT NULL,
	"gross_krw" numeric(20, 2) NOT NULL,
	"fee_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"cash_delta_krw" numeric(20, 2) NOT NULL,
	"quote_source" varchar(80) NOT NULL,
	"quote_at" timestamp with time zone NOT NULL,
	"quote_received_at" timestamp with time zone NOT NULL,
	"fx_source" varchar(80) NOT NULL,
	"fx_at" timestamp with time zone NOT NULL,
	"fx_received_at" timestamp with time zone NOT NULL,
	"rule_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executions_quantity_positive" CHECK ("executions"."quantity" > 0),
	CONSTRAINT "executions_native_price_positive" CHECK ("executions"."native_price" > 0),
	CONSTRAINT "executions_fx_rate_positive" CHECK ("executions"."fx_rate" > 0),
	CONSTRAINT "executions_gross_positive" CHECK ("executions"."gross_krw" > 0),
	CONSTRAINT "executions_fee_nonnegative" CHECK ("executions"."fee_krw" >= 0),
	CONSTRAINT "executions_cash_delta_nonzero" CHECK ("executions"."cash_delta_krw" <> 0),
	CONSTRAINT "executions_rule_version_positive" CHECK ("executions"."rule_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fx_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"rate" numeric(20, 8) NOT NULL,
	"source" varchar(80) NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_snapshots_rate_positive" CHECK ("fx_snapshots"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "fx_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"security_name" varchar(160) NOT NULL,
	"market" varchar(16) NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"status" "order_status" DEFAULT 'filled' NOT NULL,
	"client_order_id" varchar(128) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_quantity_positive" CHECK ("orders"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"security_name" varchar(160) NOT NULL,
	"market" varchar(16) NOT NULL,
	"native_currency" varchar(3) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"average_cost_krw" numeric(20, 6) DEFAULT '0.000000' NOT NULL,
	"realized_pnl_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"last_native_price" numeric(20, 6) NOT NULL,
	"last_fx_rate" numeric(20, 8) NOT NULL,
	"market_value_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"unrealized_pnl_krw" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"last_quoted_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_quantity_nonnegative" CHECK ("positions"."quantity" >= 0),
	CONSTRAINT "positions_average_cost_nonnegative" CHECK ("positions"."average_cost_krw" >= 0),
	CONSTRAINT "positions_market_value_nonnegative" CHECK ("positions"."market_value_krw" >= 0),
	CONSTRAINT "positions_version_nonnegative" CHECK ("positions"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"market" varchar(16) NOT NULL,
	"native_currency" varchar(3) NOT NULL,
	"native_price" numeric(20, 6) NOT NULL,
	"source" varchar(80) NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_snapshots_price_positive" CHECK ("price_snapshots"."native_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "price_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "executions_order_unique" ON "executions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_snapshots_source_quote_unique" ON "fx_snapshots" USING btree ("base_currency","quote_currency","source","quoted_at");--> statement-breakpoint
CREATE INDEX "fx_snapshots_pair_received_idx" ON "fx_snapshots" USING btree ("base_currency","quote_currency","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_portfolio_client_unique" ON "orders" USING btree ("portfolio_id","client_order_id");--> statement-breakpoint
CREATE INDEX "orders_portfolio_created_idx" ON "orders" USING btree ("portfolio_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_portfolio_symbol_market_unique" ON "positions" USING btree ("portfolio_id","symbol","market");--> statement-breakpoint
CREATE INDEX "positions_portfolio_value_idx" ON "positions" USING btree ("portfolio_id","market_value_krw");--> statement-breakpoint
CREATE UNIQUE INDEX "price_snapshots_source_quote_unique" ON "price_snapshots" USING btree ("symbol","market","source","quoted_at");--> statement-breakpoint
CREATE INDEX "price_snapshots_symbol_received_idx" ON "price_snapshots" USING btree ("symbol","received_at");