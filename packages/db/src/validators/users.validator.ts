import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { usersTable } from "../schema/users.schema";

export const selectUserSchema = createSelectSchema(usersTable);
export const insertUserSchema = createInsertSchema(usersTable);
