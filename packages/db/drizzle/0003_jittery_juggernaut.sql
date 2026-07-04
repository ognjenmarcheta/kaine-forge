-- better-auth schema alignment + password data migration (M1).
-- The ALTER statements below are metadata-only column renames, nullable
-- column additions, and a varchar->text widening (no table rewrites of note).
-- The trailing INSERT backfills credential accounts from users.password_hash
-- as an idempotent anti-join; the NOT EXISTS guard also protects databases
-- provisioned via `drizzle-kit push`, where accounts rows may already exist.
ALTER TABLE "accounts" RENAME COLUMN "provider_account_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "provider" TO "provider_id";--> statement-breakpoint
ALTER TABLE "verifications" RENAME COLUMN "token" TO "value";--> statement-breakpoint
ALTER TABLE "verifications" DROP CONSTRAINT "verifications_token_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "id_token" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_provider_id_account_id_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "value" SET DATA TYPE text;--> statement-breakpoint
INSERT INTO "accounts" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT gen_random_uuid(), "users"."id"::text, 'credential', "users"."id", "users"."password_hash", now(), now()
FROM "users"
WHERE "users"."password_hash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "accounts" a
    WHERE a."user_id" = "users"."id" AND a."provider_id" = 'credential'
  );
