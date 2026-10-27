CREATE TYPE "public"."data_export_kind" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TYPE "public"."data_export_status" AS ENUM('pending', 'running', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "data_export_kind" NOT NULL,
	"status" "data_export_status" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"bucket" text,
	"key" text,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_exports_user_id_kind_in_progress_unique" ON "data_exports" USING btree ("user_id","kind") WHERE "data_exports"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "data_exports_user_id_created_at_idx" ON "data_exports" USING btree ("user_id","created_at");