ALTER TABLE "source" ADD COLUMN "last_non_empty_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "last_event_count" integer;