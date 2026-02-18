CREATE TABLE "contact" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text,
	"principal_id" uuid NOT NULL,
	"relationship" text DEFAULT 'contact' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_principal_idx" ON "contact" ("principal_id");--> statement-breakpoint
CREATE INDEX "contact_principal_email_idx" ON "contact" ("principal_id","email");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");