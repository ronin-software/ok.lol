-- Drop channel from thread, drop contact table, rename document paths to .md

ALTER TABLE "thread" DROP COLUMN "channel";
DROP INDEX IF EXISTS "thread_principal_channel_idx";
CREATE INDEX IF NOT EXISTS "thread_principal_idx" ON "thread" ("principal_id");

DROP TABLE IF EXISTS "contact" CASCADE;
DROP TYPE IF EXISTS "channel";

UPDATE "document" SET "path" = "path" || '.md' WHERE "path" NOT LIKE '%.md';
