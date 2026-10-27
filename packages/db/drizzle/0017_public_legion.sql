CREATE TABLE "public_asset_purges" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION "users_public_asset_purge"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."image" IS NOT NULL THEN
    INSERT INTO "public_asset_purges" ("user_id", "url")
    VALUES (OLD."id", OLD."image")
    ON CONFLICT ("user_id") DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "users_public_asset_purge" AFTER DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "users_public_asset_purge"();
