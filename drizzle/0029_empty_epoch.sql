CREATE TABLE "event_photo" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"mime" varchar(30) NOT NULL,
	"octets" integer NOT NULL,
	"largeur" integer NOT NULL,
	"hauteur" integer NOT NULL,
	"contenu" "bytea" NOT NULL,
	"added_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo" ADD CONSTRAINT "event_photo_added_by_account_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;