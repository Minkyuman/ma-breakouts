CREATE TABLE IF NOT EXISTS "service_announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(120) NOT NULL,
  "body" text NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_announcements_visible_idx" ON "service_announcements" USING btree ("is_published","published_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_announcements_created_idx" ON "service_announcements" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_announcement_acknowledgements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL REFERENCES "service_announcements"("id") ON DELETE cascade,
  "google_sub" text NOT NULL,
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_announcement_ack_user_unique" ON "service_announcement_acknowledgements" USING btree ("announcement_id","google_sub");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_announcement_ack_user_idx" ON "service_announcement_acknowledgements" USING btree ("google_sub","acknowledged_at");
--> statement-breakpoint
ALTER TABLE "service_announcements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_announcement_acknowledgements" ENABLE ROW LEVEL SECURITY;
