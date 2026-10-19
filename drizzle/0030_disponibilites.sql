CREATE TYPE "public"."disponibilite_statut" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE TABLE "disponibilite_hebdo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"jour" smallint NOT NULL,
	"debut" smallint NOT NULL,
	"fin" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disponibilite_hebdo_jour" CHECK ("disponibilite_hebdo"."jour" between 1 and 7),
	CONSTRAINT "disponibilite_hebdo_heures" CHECK ("disponibilite_hebdo"."debut" >= 0 and "disponibilite_hebdo"."fin" <= 1440 and "disponibilite_hebdo"."fin" > "disponibilite_hebdo"."debut")
);
--> statement-breakpoint
CREATE TABLE "disponibilite_lecteur" (
	"account_id" uuid NOT NULL,
	"lecteur_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disponibilite_lecteur_account_id_lecteur_id_pk" PRIMARY KEY("account_id","lecteur_id"),
	CONSTRAINT "disponibilite_lecteur_pas_soi" CHECK ("disponibilite_lecteur"."account_id" <> "disponibilite_lecteur"."lecteur_id")
);
--> statement-breakpoint
CREATE TABLE "disponibilite_vacances" (
	"account_id" uuid NOT NULL,
	"semaine" date NOT NULL,
	"statut" "disponibilite_statut" NOT NULL,
	CONSTRAINT "disponibilite_vacances_account_id_semaine_pk" PRIMARY KEY("account_id","semaine"),
	CONSTRAINT "disponibilite_vacances_lundi" CHECK (extract(isodow from "disponibilite_vacances"."semaine") = 1)
);
--> statement-breakpoint
ALTER TABLE "disponibilite_hebdo" ADD CONSTRAINT "disponibilite_hebdo_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_lecteur" ADD CONSTRAINT "disponibilite_lecteur_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_lecteur" ADD CONSTRAINT "disponibilite_lecteur_lecteur_id_account_id_fk" FOREIGN KEY ("lecteur_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilite_vacances" ADD CONSTRAINT "disponibilite_vacances_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disponibilite_hebdo_account_idx" ON "disponibilite_hebdo" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "disponibilite_lecteur_lecteur_idx" ON "disponibilite_lecteur" USING btree ("lecteur_id");