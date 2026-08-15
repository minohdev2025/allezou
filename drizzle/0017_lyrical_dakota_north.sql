ALTER TABLE "event" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "lon" double precision;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "geocoded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "lon" double precision;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "geocoded_at" timestamp with time zone;