CREATE TYPE "channel" AS ENUM('chat', 'email');--> statement-breakpoint
CREATE TABLE "thread" (
	"channel" "channel" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"principal_id" uuid NOT NULL,
	"title" text
);
--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_principal_id_principal_id_fkey";--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "parts" jsonb;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "summary_id" uuid;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "thread_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "tokens" integer;--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "channel";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "payload";--> statement-breakpoint
ALTER TABLE "message" DROP COLUMN "principal_id";--> statement-breakpoint
ALTER TABLE "worker" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "message_thread_summary_idx" ON "message" ("thread_id","summary_id");--> statement-breakpoint
CREATE INDEX "message_thread_created_idx" ON "message" ("thread_id","created_at");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_summary_id_message_id_fkey" FOREIGN KEY ("summary_id") REFERENCES "message"("id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "thread"("id");--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");