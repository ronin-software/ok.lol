CREATE TABLE "account" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL UNIQUE,
	"id" text PRIMARY KEY,
	"name" text,
	"password_hash" text NOT NULL,
	"stripe_connect_id" text,
	"stripe_customer_id" text
);
--> statement-breakpoint
CREATE TABLE "document" (
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_by" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"path" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"principal_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hire" (
	"caller_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"input" jsonb DEFAULT '{}' NOT NULL,
	"listing_id" uuid NOT NULL,
	"pending_transfer_id" text,
	"rating" integer,
	"settled_at" timestamp,
	"status" text DEFAULT 'escrowed' NOT NULL,
	"usage_budget" bigint
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"input_schema" jsonb,
	"price" bigint,
	"principal_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"usage_budget" bigint
);
--> statement-breakpoint
CREATE TABLE "message" (
	"channel" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"payload" jsonb NOT NULL,
	"principal_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"account_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"fee" bigint NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"pending_transfer_id" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"stripe_transfer_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "principal" (
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"account_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"hire_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"resource" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");--> statement-breakpoint
ALTER TABLE "hire" ADD CONSTRAINT "hire_caller_id_principal_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "principal"("id");--> statement-breakpoint
ALTER TABLE "hire" ADD CONSTRAINT "hire_listing_id_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id");--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_principal_id_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "principal"("id");--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "principal" ADD CONSTRAINT "principal_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_hire_id_hire_id_fkey" FOREIGN KEY ("hire_id") REFERENCES "hire"("id");