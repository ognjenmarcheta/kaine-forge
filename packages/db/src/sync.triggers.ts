/**
 * The Sync Version and Tombstone triggers, as idempotent SQL. Migrations 0027
 * and 0028 hold frozen copies; this one installs them on a schema built by
 * `drizzle-kit push`, which never runs a migration's custom SQL (local setup
 * and CI e2e). It then versions rows written before the triggers existed:
 * the no-op update fires the version trigger on each.
 */
export const SYNC_TRIGGERS_SQL = /* sql */ `
CREATE OR REPLACE FUNCTION "sync_next_version"("org" uuid) RETURNS bigint LANGUAGE plpgsql AS $$
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
$$;
CREATE OR REPLACE FUNCTION "sync_stamp_version"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  "next" bigint := "sync_next_version"(NEW."organization_id");
BEGIN
  IF "next" IS NOT NULL THEN
    NEW."sync_version" := "next";
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "sync_record_tombstone"() RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;
CREATE OR REPLACE FUNCTION "sync_touch_attachment_todos"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."entity_type" = 'todo' THEN
    UPDATE "todos" SET "sync_version" = "sync_version" WHERE "id" = NEW."entity_id";
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."entity_type" = 'todo'
    AND OLD."entity_id" IS DISTINCT FROM NEW."entity_id" THEN
    UPDATE "todos" SET "sync_version" = "sync_version" WHERE "id" = OLD."entity_id";
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER "todos_sync_version" BEFORE INSERT OR UPDATE ON "todos" FOR EACH ROW EXECUTE FUNCTION "sync_stamp_version"();
CREATE OR REPLACE TRIGGER "notes_sync_version" BEFORE INSERT OR UPDATE ON "notes" FOR EACH ROW EXECUTE FUNCTION "sync_stamp_version"();
CREATE OR REPLACE TRIGGER "todos_sync_tombstone" AFTER DELETE ON "todos" FOR EACH ROW EXECUTE FUNCTION "sync_record_tombstone"('todo');
CREATE OR REPLACE TRIGGER "notes_sync_tombstone" AFTER DELETE ON "notes" FOR EACH ROW EXECUTE FUNCTION "sync_record_tombstone"('note');
CREATE OR REPLACE TRIGGER "files_sync_todo_version" AFTER INSERT OR UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION "sync_touch_attachment_todos"();
UPDATE "todos" SET "sync_version" = 0 WHERE "sync_version" = 0;
UPDATE "notes" SET "sync_version" = 0 WHERE "sync_version" = 0;
`;
