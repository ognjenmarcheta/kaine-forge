import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { sessionsTable } from "../schema/sessions.schema";

export const selectSessionSchema = createSelectSchema(sessionsTable);
export const insertSessionSchema = createInsertSchema(sessionsTable);
