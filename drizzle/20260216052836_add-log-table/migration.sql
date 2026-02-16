CREATE TABLE "log" (
	"capability" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"input" jsonb NOT NULL,
	"principal_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "log" ADD CONSTRAINT "log_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");