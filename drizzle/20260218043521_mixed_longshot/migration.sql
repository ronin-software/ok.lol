CREATE TYPE "hire_status" AS ENUM('escrowed', 'settled', 'refunded');--> statement-breakpoint
CREATE TYPE "payout_status" AS ENUM('reserved', 'transferred', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_summary_id_message_id_fkey";--> statement-breakpoint
ALTER TABLE "hire" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "hire" ALTER COLUMN "status" SET DATA TYPE "hire_status" USING "status"::"hire_status";--> statement-breakpoint
ALTER TABLE "hire" ALTER COLUMN "status" SET DEFAULT 'escrowed'::"hire_status";--> statement-breakpoint
ALTER TABLE "payout" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payout" ALTER COLUMN "status" SET DATA TYPE "payout_status" USING "status"::"payout_status";--> statement-breakpoint
ALTER TABLE "payout" ALTER COLUMN "status" SET DEFAULT 'reserved'::"payout_status";--> statement-breakpoint
CREATE INDEX "account_stripe_connect_idx" ON "account" ("stripe_connect_id");--> statement-breakpoint
CREATE INDEX "document_principal_path_idx" ON "document" ("principal_id","path","created_at");--> statement-breakpoint
CREATE INDEX "hire_caller_idx" ON "hire" ("caller_id");--> statement-breakpoint
CREATE INDEX "hire_listing_idx" ON "hire" ("listing_id");--> statement-breakpoint
CREATE INDEX "payout_account_idx" ON "payout" ("account_id");--> statement-breakpoint
CREATE INDEX "principal_account_idx" ON "principal" ("account_id");--> statement-breakpoint
CREATE INDEX "thread_principal_channel_idx" ON "thread" ("principal_id","channel");--> statement-breakpoint
CREATE INDEX "usage_account_created_idx" ON "usage" ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_hire_idx" ON "usage" ("hire_id");--> statement-breakpoint
CREATE INDEX "worker_account_idx" ON "worker" ("account_id");--> statement-breakpoint
-- Drizzle cannot model self-referential FKs; re-add after it drops it above.
ALTER TABLE "message" ADD CONSTRAINT "message_summary_id_message_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "message"("id");