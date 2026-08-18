ALTER TABLE "account" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_link" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_locale_connue" CHECK ("account"."locale" in ('fr', 'en', 'es', 'pt', 'sq'));