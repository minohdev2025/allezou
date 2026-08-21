CREATE TABLE "coparent" (
	"account_a" uuid NOT NULL,
	"account_b" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coparent_account_a_account_b_pk" PRIMARY KEY("account_a","account_b"),
	CONSTRAINT "coparent_canonical_order" CHECK ("coparent"."account_a" < "coparent"."account_b")
);
--> statement-breakpoint
ALTER TABLE "coparent" ADD CONSTRAINT "coparent_account_a_account_id_fk" FOREIGN KEY ("account_a") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coparent" ADD CONSTRAINT "coparent_account_b_account_id_fk" FOREIGN KEY ("account_b") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Les liens deja acceptes deviennent des liens durables : sans cette reprise, les parents
-- deja rattaches garderaient un partage fige au jour ou ils ont clique.
INSERT INTO "coparent" ("account_a", "account_b")
SELECT least(i."created_by", i."used_by"), greatest(i."created_by", i."used_by")
FROM "coparent_invite" i
JOIN "account" a ON a."id" = i."created_by" AND a."deleted_at" IS NULL
JOIN "account" b ON b."id" = i."used_by" AND b."deleted_at" IS NULL
WHERE i."used_at" IS NOT NULL AND i."created_by" <> i."used_by"
ON CONFLICT DO NOTHING;
