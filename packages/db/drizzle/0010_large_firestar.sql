-- Map entity types the enum does not know to "general" before the cast, so the migration applies to a database that holds them.
UPDATE "files" SET "entity_type" = 'general' WHERE "entity_type" IS NOT NULL AND "entity_type" NOT IN ('general', 'todo');--> statement-breakpoint
CREATE TYPE "public"."attachment_entity_type" AS ENUM('general', 'todo');--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "entity_type" SET DATA TYPE "public"."attachment_entity_type" USING "entity_type"::"public"."attachment_entity_type";