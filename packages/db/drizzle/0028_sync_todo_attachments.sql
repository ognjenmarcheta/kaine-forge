-- A change to a Todo's Attachment rows gives the Todo a new Sync Version: the
-- no-op update fires its version trigger, so a pull returns the Todo with its
-- current Attachments. sync.triggers.ts installs the same function and
-- trigger on a schema built by drizzle-kit push.
CREATE FUNCTION "sync_touch_attachment_todos"() RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;--> statement-breakpoint
CREATE TRIGGER "files_sync_todo_version" AFTER INSERT OR UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION "sync_touch_attachment_todos"();
