CREATE TYPE "public"."feedback_kind" AS ENUM('experience', 'suggestion', 'problem');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'read', 'done');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"message" text NOT NULL,
	"name" text,
	"contact" text,
	"page" text,
	"user_id" uuid,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_message_length" CHECK (char_length("feedback"."message") BETWEEN 10 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_created_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE TRIGGER feedback_touch_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
