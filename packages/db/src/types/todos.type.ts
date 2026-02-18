import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { todosTable } from "../schema/todos.schema";

export type Todo = InferSelectModel<typeof todosTable>;
export type NewTodo = InferInsertModel<typeof todosTable>;
