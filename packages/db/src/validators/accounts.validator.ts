import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { accountsTable } from "../schema/accounts.schema";

export const selectAccountSchema = createSelectSchema(accountsTable);
export const insertAccountSchema = createInsertSchema(accountsTable);
