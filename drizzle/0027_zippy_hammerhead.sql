CREATE TYPE "public"."idea_type" AS ENUM('fonctionnalite', 'bug');--> statement-breakpoint
CREATE TABLE "idea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "idea_type" NOT NULL,
	"titre" varchar(120) NOT NULL,
	"texte" varchar(2000) NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "idea_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"texte" varchar(2000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_vote" (
	"idea_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_vote_idea_id_account_id_pk" PRIMARY KEY("idea_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_author_id_account_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_closed_by_account_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_message" ADD CONSTRAINT "idea_message_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_message" ADD CONSTRAINT "idea_message_author_id_account_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_vote" ADD CONSTRAINT "idea_vote_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_vote" ADD CONSTRAINT "idea_vote_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_author_idx" ON "idea" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idea_open_idx" ON "idea" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "idea_message_idea_idx" ON "idea_message" USING btree ("idea_id","created_at");