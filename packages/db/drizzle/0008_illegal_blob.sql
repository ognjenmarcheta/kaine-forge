CREATE INDEX "files_organization_id_entity_type_entity_id_idx" ON "files" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notes_organization_id_created_at_idx" ON "notes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "todos_organization_id_created_at_idx" ON "todos" USING btree ("organization_id","created_at");