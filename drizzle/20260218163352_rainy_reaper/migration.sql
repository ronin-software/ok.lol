CREATE INDEX "listing_principal_idx" ON "listing" ("principal_id");--> statement-breakpoint
CREATE INDEX "log_principal_created_idx" ON "log" ("principal_id","created_at");--> statement-breakpoint
CREATE INDEX "message_summary_created_idx" ON "message" ("summary_id","created_at");