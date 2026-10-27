CREATE TABLE "organization_storage_purges" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "organizations" SET "personal" = true WHERE "slug" = 'personal-' || left("user_id"::text, 8) OR "slug" ~ '^personal-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';--> statement-breakpoint
CREATE FUNCTION "organizations_storage_purge"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "organization_storage_purges" ("organization_id", "logo")
  VALUES (OLD."id", OLD."logo")
  ON CONFLICT ("organization_id") DO NOTHING;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "organizations_storage_purge" AFTER DELETE ON "organizations" FOR EACH ROW EXECUTE FUNCTION "organizations_storage_purge"();
