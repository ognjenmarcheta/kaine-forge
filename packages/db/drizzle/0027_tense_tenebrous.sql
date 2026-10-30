CREATE TYPE "public"."sync_entity" AS ENUM('todo', 'note');--> statement-breakpoint
CREATE TABLE "organization_sync_versions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"pruned_through" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutation_receipts" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_mutation_receipts_organization_id_user_id_idempotency_key_pk" PRIMARY KEY("organization_id","user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sync_tombstones" (
	"organization_id" uuid NOT NULL,
	"entity" "sync_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"sync_version" bigint NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_tombstones_organization_id_entity_entity_id_pk" PRIMARY KEY("organization_id","entity","entity_id")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "sync_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "sync_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_sync_versions" ADD CONSTRAINT "organization_sync_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutation_receipts" ADD CONSTRAINT "sync_mutation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutation_receipts" ADD CONSTRAINT "sync_mutation_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_tombstones" ADD CONSTRAINT "sync_tombstones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_mutation_receipts_created_at_idx" ON "sync_mutation_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_tombstones_organization_id_sync_version_idx" ON "sync_tombstones" USING btree ("organization_id","sync_version");--> statement-breakpoint
CREATE INDEX "sync_tombstones_deleted_at_idx" ON "sync_tombstones" USING btree ("deleted_at");--> statement-breakpoint
-- Existing rows get distinct Sync Versions per Organization, in creation
-- order, before the unique indexes and the triggers exist.
WITH "changes" AS (
  SELECT 'todo' AS "entity", "id", "organization_id", "created_at" FROM "todos"
  UNION ALL
  SELECT 'note', "id", "organization_id", "created_at" FROM "notes"
), "numbered" AS (
  SELECT "entity", "id", row_number() OVER (
    PARTITION BY "organization_id" ORDER BY "created_at", "entity", "id"
  ) AS "version"
  FROM "changes"
)
UPDATE "todos" SET "sync_version" = "numbered"."version"
FROM "numbered" WHERE "numbered"."entity" = 'todo' AND "todos"."id" = "numbered"."id";--> statement-breakpoint
WITH "changes" AS (
  SELECT 'todo' AS "entity", "id", "organization_id", "created_at" FROM "todos"
  UNION ALL
  SELECT 'note', "id", "organization_id", "created_at" FROM "notes"
), "numbered" AS (
  SELECT "entity", "id", row_number() OVER (
    PARTITION BY "organization_id" ORDER BY "created_at", "entity", "id"
  ) AS "version"
  FROM "changes"
)
UPDATE "notes" SET "sync_version" = "numbered"."version"
FROM "numbered" WHERE "numbered"."entity" = 'note' AND "notes"."id" = "numbered"."id";--> statement-breakpoint
INSERT INTO "organization_sync_versions" ("organization_id", "version")
SELECT "organization_id", max("sync_version") FROM (
  SELECT "organization_id", "sync_version" FROM "todos"
  UNION ALL
  SELECT "organization_id", "sync_version" FROM "notes"
) AS "rows"
GROUP BY "organization_id";--> statement-breakpoint
CREATE UNIQUE INDEX "notes_organization_id_sync_version_idx" ON "notes" USING btree ("organization_id","sync_version");--> statement-breakpoint
CREATE UNIQUE INDEX "todos_organization_id_sync_version_idx" ON "todos" USING btree ("organization_id","sync_version");--> statement-breakpoint
-- The next Sync Version of an Organization. The upsert's row lock holds until
-- the writing transaction ends, so versions commit in order. NULL while the
-- Organization itself is being deleted: its rows and counter go with it.
CREATE FUNCTION "sync_next_version"("org" uuid) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  "next" bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = "org") THEN
    RETURN NULL;
  END IF;
  INSERT INTO "organization_sync_versions" ("organization_id", "version")
  VALUES ("org", 1)
  ON CONFLICT ("organization_id")
  DO UPDATE SET "version" = "organization_sync_versions"."version" + 1
  RETURNING "version" INTO "next";
  RETURN "next";
END;
$$;--> statement-breakpoint
CREATE FUNCTION "sync_stamp_version"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  "next" bigint := "sync_next_version"(NEW."organization_id");
BEGIN
  IF "next" IS NOT NULL THEN
    NEW."sync_version" := "next";
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
-- TG_ARGV[0] names the entity. A trigger, not app code, so cascades
-- (a deleted user's rows) leave Tombstones too.
CREATE FUNCTION "sync_record_tombstone"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  "next" bigint := "sync_next_version"(OLD."organization_id");
BEGIN
  IF "next" IS NOT NULL THEN
    INSERT INTO "sync_tombstones" ("organization_id", "entity", "entity_id", "sync_version")
    VALUES (OLD."organization_id", TG_ARGV[0]::"sync_entity", OLD."id", "next")
    ON CONFLICT ("organization_id", "entity", "entity_id")
    DO UPDATE SET "sync_version" = EXCLUDED."sync_version", "deleted_at" = now();
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "todos_sync_version" BEFORE INSERT OR UPDATE ON "todos" FOR EACH ROW EXECUTE FUNCTION "sync_stamp_version"();--> statement-breakpoint
CREATE TRIGGER "notes_sync_version" BEFORE INSERT OR UPDATE ON "notes" FOR EACH ROW EXECUTE FUNCTION "sync_stamp_version"();--> statement-breakpoint
CREATE TRIGGER "todos_sync_tombstone" AFTER DELETE ON "todos" FOR EACH ROW EXECUTE FUNCTION "sync_record_tombstone"('todo');--> statement-breakpoint
CREATE TRIGGER "notes_sync_tombstone" AFTER DELETE ON "notes" FOR EACH ROW EXECUTE FUNCTION "sync_record_tombstone"('note');
