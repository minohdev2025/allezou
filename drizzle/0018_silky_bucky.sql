CREATE TABLE "child_circle" (
	"child_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	CONSTRAINT "child_circle_child_id_circle_id_pk" PRIMARY KEY("child_id","circle_id")
);
--> statement-breakpoint
ALTER TABLE "child_circle" ADD CONSTRAINT "child_circle_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_circle" ADD CONSTRAINT "child_circle_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;