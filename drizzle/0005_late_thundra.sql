CREATE TABLE "favorite_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"security_name" varchar(160) NOT NULL,
	"market" varchar(16) NOT NULL,
	"native_currency" varchar(3) NOT NULL,
	"asset_type" varchar(8) DEFAULT 'STOCK' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_list_items_sort_nonnegative" CHECK ("favorite_list_items"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "favorite_list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "favorite_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_lists_sort_nonnegative" CHECK ("favorite_lists"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "favorite_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorite_list_items" ADD CONSTRAINT "favorite_list_items_list_id_favorite_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."favorite_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_lists" ADD CONSTRAINT "favorite_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_list_items_security_unique" ON "favorite_list_items" USING btree ("list_id","symbol","market");--> statement-breakpoint
CREATE INDEX "favorite_list_items_list_sort_idx" ON "favorite_list_items" USING btree ("list_id","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_lists_user_name_unique" ON "favorite_lists" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "favorite_lists_user_sort_idx" ON "favorite_lists" USING btree ("user_id","sort_order","created_at");