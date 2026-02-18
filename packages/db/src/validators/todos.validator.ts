import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { todosTable } from "../schema/todos.schema";

export const selectTodoSchema = createSelectSchema(todosTable);
export const insertTodoSchema = createInsertSchema(todosTable);
