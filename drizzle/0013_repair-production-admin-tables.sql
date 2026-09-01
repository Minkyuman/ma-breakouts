-- Repairs a historical partial-production migration. Every statement is
-- additive/idempotent: no existing participant or league data is modified.
CREATE TABLE IF NOT EXISTS "analysis_settings" (
  "key" varchar(40) PRIMARY KEY NOT NULL,
  "selected_model" varchar(160) NOT NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "analysis_settings_model_nonempty" CHECK (length(trim("selected_model")) > 0)
);
--> statement-breakpoint
ALTER TABLE "analysis_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."access_request_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "google_sub" text NOT NULL,
  "email" text NOT NULL,
  "display_name" text,
  "status" "public"."access_request_status" DEFAULT 'pending' NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "decided_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "access_requests_google_sub_unique" ON "access_requests" USING btree ("google_sub");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "access_requests_email_unique" ON "access_requests" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_requests_status_requested_idx" ON "access_requests" USING btree ("status", "requested_at");
