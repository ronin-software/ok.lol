CREATE TABLE "worker" (
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker" ADD CONSTRAINT "worker_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");