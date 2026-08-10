CREATE TABLE "passkey" (
	"id" varchar(500) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"public_key" varchar(1000) NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" varchar(120),
	"label" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkey_account_idx" ON "passkey" USING btree ("account_id");