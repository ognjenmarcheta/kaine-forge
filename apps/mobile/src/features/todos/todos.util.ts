import { toTodoCreatePayload, toTodoUpdatePayload } from "@repo/todos";

import type { CreateTodoPayload, TodoDraft, TodoItem, UpdateTodoPayload } from "./todos.type";

export function toCreatePayload(draft: TodoDraft): CreateTodoPayload {
  return toTodoCreatePayload(draft);
}

export function toUpdatePayload(draft: TodoDraft, current: TodoItem): UpdateTodoPayload {
  return toTodoUpdatePayload(draft, current);
}
