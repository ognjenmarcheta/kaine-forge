ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;