CREATE TYPE "public"."circle_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."event_origin" AS ENUM('parent', 'feed', 'ai');--> statement-breakpoint
CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."publication_kind" AS ENUM('presence', 'attendance');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('ical', 'jsonld', 'html_ai');--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "account_email_lowercase" CHECK ("account"."email" = lower("account"."email"))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" varchar(60) NOT NULL,
	"circle_id" uuid,
	"target_account_id" uuid,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "child" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(40) NOT NULL,
	"birth_year" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "child_parent" (
	"child_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_parent_child_id_account_id_pk" PRIMARY KEY("child_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "circle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circle_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"created_by" uuid,
	"token_hash" varchar(64) NOT NULL,
	"max_uses" integer DEFAULT 20 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_invite_uses" CHECK ("circle_invite"."use_count" <= "circle_invite"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "circle_join_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"invite_id" uuid,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid
);
--> statement-breakpoint
CREATE TABLE "circle_link_cut" (
	"circle_id" uuid NOT NULL,
	"account_a" uuid NOT NULL,
	"account_b" uuid NOT NULL,
	"cut_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circle_link_cut_circle_id_account_a_account_b_pk" PRIMARY KEY("circle_id","account_a","account_b"),
	CONSTRAINT "circle_link_cut_canonical_order" CHECK ("circle_link_cut"."account_a" < "circle_link_cut"."account_b")
);
--> statement-breakpoint
CREATE TABLE "circle_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "circle_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "circle_membership_dates" CHECK ("circle_membership"."left_at" is null or "circle_membership"."left_at" >= "circle_membership"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "coparent_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(280),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"place_id" uuid,
	"place_label" varchar(120),
	"url" varchar(500),
	"origin" "event_origin" NOT NULL,
	"source_id" uuid,
	"external_id" varchar(200),
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_dates" CHECK ("event"."ends_at" is null or "event"."ends_at" >= "event"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "magic_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_mute" (
	"account_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	"muted_account_id" uuid NOT NULL,
	CONSTRAINT "notification_mute_account_id_circle_id_muted_account_id_pk" PRIMARY KEY("account_id","circle_id","muted_account_id")
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"account_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	"on_presence" boolean DEFAULT true NOT NULL,
	"on_attendance" boolean DEFAULT true NOT NULL,
	"paused_until" timestamp with time zone,
	CONSTRAINT "notification_pref_account_id_circle_id_pk" PRIMARY KEY("account_id","circle_id")
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"commune" varchar(60),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_rename_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"proposed_name" varchar(80) NOT NULL,
	"proposed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"rejected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_rename_vote" (
	"proposal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_rename_vote_proposal_id_account_id_pk" PRIMARY KEY("proposal_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "publication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" "publication_kind" NOT NULL,
	"place_id" uuid,
	"event_id" uuid,
	"note" varchar(140),
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_dates" CHECK ("publication"."ends_at" > "publication"."starts_at"),
	CONSTRAINT "publication_shape" CHECK (("publication"."kind" = 'presence' and "publication"."place_id" is not null and "publication"."event_id" is null)
          or ("publication"."kind" = 'attendance' and "publication"."event_id" is not null and "publication"."place_id" is null))
);
--> statement-breakpoint
CREATE TABLE "publication_circle" (
	"publication_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	CONSTRAINT "publication_circle_publication_id_circle_id_pk" PRIMARY KEY("publication_id","circle_id")
);
--> statement-breakpoint
CREATE TABLE "publication_hidden_from" (
	"publication_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "publication_hidden_from_publication_id_account_id_pk" PRIMARY KEY("publication_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"p256dh" varchar(200) NOT NULL,
	"auth" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"url" varchar(500) NOT NULL,
	"kind" "source_kind" NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_account_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_account_id_account_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_parent" ADD CONSTRAINT "child_parent_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_parent" ADD CONSTRAINT "child_parent_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle" ADD CONSTRAINT "circle_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invite" ADD CONSTRAINT "circle_invite_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_invite" ADD CONSTRAINT "circle_invite_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_request" ADD CONSTRAINT "circle_join_request_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_request" ADD CONSTRAINT "circle_join_request_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_request" ADD CONSTRAINT "circle_join_request_invite_id_circle_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."circle_invite"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_join_request" ADD CONSTRAINT "circle_join_request_decided_by_account_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_link_cut" ADD CONSTRAINT "circle_link_cut_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_link_cut" ADD CONSTRAINT "circle_link_cut_account_a_account_id_fk" FOREIGN KEY ("account_a") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_link_cut" ADD CONSTRAINT "circle_link_cut_account_b_account_id_fk" FOREIGN KEY ("account_b") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_link_cut" ADD CONSTRAINT "circle_link_cut_cut_by_account_id_fk" FOREIGN KEY ("cut_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_membership" ADD CONSTRAINT "circle_membership_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_membership" ADD CONSTRAINT "circle_membership_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coparent_invite" ADD CONSTRAINT "coparent_invite_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coparent_invite" ADD CONSTRAINT "coparent_invite_used_by_account_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_mute" ADD CONSTRAINT "notification_mute_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_mute" ADD CONSTRAINT "notification_mute_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_mute" ADD CONSTRAINT "notification_mute_muted_account_id_account_id_fk" FOREIGN KEY ("muted_account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_created_by_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_rename_proposal" ADD CONSTRAINT "place_rename_proposal_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_rename_proposal" ADD CONSTRAINT "place_rename_proposal_proposed_by_account_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_rename_vote" ADD CONSTRAINT "place_rename_vote_proposal_id_place_rename_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."place_rename_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_rename_vote" ADD CONSTRAINT "place_rename_vote_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_author_id_account_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_circle" ADD CONSTRAINT "publication_circle_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_circle" ADD CONSTRAINT "publication_circle_circle_id_circle_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_hidden_from" ADD CONSTRAINT "publication_hidden_from_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_hidden_from" ADD CONSTRAINT "publication_hidden_from_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_key" ON "account" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_log_circle_idx" ON "audit_log" USING btree ("circle_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_invite_token_key" ON "circle_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_join_request_pending_key" ON "circle_join_request" USING btree ("circle_id","account_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "circle_membership_active_key" ON "circle_membership" USING btree ("circle_id","account_id") WHERE left_at is null;--> statement-breakpoint
CREATE INDEX "circle_membership_account_idx" ON "circle_membership" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coparent_invite_token_key" ON "coparent_invite" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "event_source_external_key" ON "event" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "event_starts_at_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "magic_link_token_key" ON "magic_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "place_name_idx" ON "place" USING btree ("name");--> statement-breakpoint
CREATE INDEX "publication_author_idx" ON "publication" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "publication_ends_at_idx" ON "publication" USING btree ("ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_account_idx" ON "session" USING btree ("account_id");