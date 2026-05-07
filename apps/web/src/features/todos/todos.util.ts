import { toTodoCreatePayload, toTodoUpdatePayload } from "@repo/todos";

import type { TodoDraft, TodoItem } from "./todos.type";

export function toCreatePayload(draft: TodoDraft) {
  return toTodoCreatePayload(draft);
}

export function toUpdatePayload(draft: TodoDraft, original: TodoItem) {
  return toTodoUpdatePayload(draft, original);
}
