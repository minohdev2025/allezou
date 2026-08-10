ALTER TABLE "event" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "config" jsonb;