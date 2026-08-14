CREATE TABLE "agenda_keyword" (
	"account_id" uuid NOT NULL,
	"word" varchar(40) NOT NULL,
	"label" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_keyword_account_id_word_pk" PRIMARY KEY("account_id","word")
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "alerte_inscription" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agenda_keyword" ADD CONSTRAINT "agenda_keyword_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;