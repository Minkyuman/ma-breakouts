CREATE TABLE "league_research_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"security_name" varchar(160) NOT NULL,
	"market" varchar(16) NOT NULL,
	"asset_type" varchar(8) NOT NULL,
	"research_note" text,
	"analysis_date" date DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_research_picks_symbol_nonempty" CHECK (length(trim("league_research_picks"."symbol")) > 0),
	CONSTRAINT "league_research_picks_name_nonempty" CHECK (length(trim("league_research_picks"."security_name")) > 0),
	CONSTRAINT "league_research_picks_note_length" CHECK ("league_research_picks"."research_note" is null OR char_length("league_research_picks"."research_note") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "league_research_picks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_research_picks" ADD CONSTRAINT "league_research_picks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_research_picks" ADD CONSTRAINT "league_research_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_research_picks_season_updated_idx" ON "league_research_picks" USING btree ("season_id","updated_at");--> statement-breakpoint
CREATE INDEX "league_research_picks_season_security_date_idx" ON "league_research_picks" USING btree ("season_id","symbol","market","analysis_date");--> statement-breakpoint
CREATE INDEX "league_research_picks_owner_updated_idx" ON "league_research_picks" USING btree ("user_id","updated_at");