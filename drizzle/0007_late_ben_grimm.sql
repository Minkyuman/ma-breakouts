CREATE TABLE "analysis_settings" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"selected_model" varchar(160) NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_settings_model_nonempty" CHECK (length(trim("analysis_settings"."selected_model")) > 0)
);
--> statement-breakpoint
ALTER TABLE "analysis_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analysis_settings" ADD CONSTRAINT "analysis_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;