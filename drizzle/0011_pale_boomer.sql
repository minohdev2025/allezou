CREATE TYPE "public"."event_acces" AS ENUM('libre', 'inscription', 'inconnu');--> statement-breakpoint
CREATE TYPE "public"."event_tarif" AS ENUM('gratuit', 'payant', 'inconnu');--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "tarif" "event_tarif" DEFAULT 'inconnu' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "acces" "event_acces" DEFAULT 'inconnu' NOT NULL;