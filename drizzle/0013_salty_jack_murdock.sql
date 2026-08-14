ALTER TABLE "event" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "withdrawn_at" timestamp with time zone;