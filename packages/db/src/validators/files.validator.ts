import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { filesTable } from "../schema/files.schema";

export const selectFileSchema = createSelectSchema(filesTable);
export const insertFileSchema = createInsertSchema(filesTable);
