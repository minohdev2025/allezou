ALTER TABLE "audit_log" ADD COLUMN "target_email" varchar(254);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "outcome" varchar(30) DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_account_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
CREATE INDEX "audit_log_email_idx" ON "audit_log" USING btree ("target_email");