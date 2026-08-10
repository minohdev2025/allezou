CREATE TABLE "publication_participant" (
	"publication_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_participant_publication_id_account_id_pk" PRIMARY KEY("publication_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "publication_participant_child" (
	"publication_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "publication_participant_child_publication_id_account_id_child_id_pk" PRIMARY KEY("publication_id","account_id","child_id")
);
--> statement-breakpoint
ALTER TABLE "publication_participant" ADD CONSTRAINT "publication_participant_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_participant" ADD CONSTRAINT "publication_participant_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_participant_child" ADD CONSTRAINT "publication_participant_child_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_participant_child" ADD CONSTRAINT "publication_participant_child_publication_id_account_id_publication_participant_publication_id_account_id_fk" FOREIGN KEY ("publication_id","account_id") REFERENCES "public"."publication_participant"("publication_id","account_id") ON DELETE cascade ON UPDATE no action;