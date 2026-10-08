CREATE TYPE "public"."service_request_status" AS ENUM('new', 'contacted', 'scheduled', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('farm_plan', 'site_visit', 'planting', 'watering', 'orchard_care', 'survival_check', 'training');--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"service" "service_type" NOT NULL,
	"location" text NOT NULL,
	"land_acres" numeric(9, 2),
	"notes" text,
	"status" "service_request_status" DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_land_acres_positive" CHECK ("service_requests"."land_acres" IS NULL OR "service_requests"."land_acres" > 0)
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_requests_status_created_idx" ON "service_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "service_requests_user_idx" ON "service_requests" USING btree ("user_id");--> statement-breakpoint
CREATE TRIGGER service_requests_touch_updated_at BEFORE UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
