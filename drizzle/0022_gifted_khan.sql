CREATE TABLE "place_favorite" (
	"account_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_favorite_account_id_place_id_pk" PRIMARY KEY("account_id","place_id")
);
--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "place_favorite" ADD CONSTRAINT "place_favorite_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_favorite" ADD CONSTRAINT "place_favorite_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;