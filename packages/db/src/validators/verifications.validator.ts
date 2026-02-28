import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { verificationsTable } from "../schema/verifications.schema";

export const selectVerificationSchema = createSelectSchema(verificationsTable);
export const insertVerificationSchema = createInsertSchema(verificationsTable);
