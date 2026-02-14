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
CREATE TABLE "bot" (
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "bot_document" (
	"bot_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bot_document_bot_kind" UNIQUE("bot_id","kind")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"bot_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"payload" jsonb NOT NULL
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
CREATE TABLE "usage" (
	"account_id" text NOT NULL,
	"cost" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"input_tokens" integer NOT NULL,
	"model" text NOT NULL,
	"output_tokens" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot" ADD CONSTRAINT "bot_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "bot_document" ADD CONSTRAINT "bot_document_bot_id_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bot"("id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_bot_id_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bot"("id");--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");