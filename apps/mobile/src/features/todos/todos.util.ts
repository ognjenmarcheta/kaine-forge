import type { CreateTodoPayload, TodoDraft, TodoItem, UpdateTodoPayload } from "./todos.type";

export function toCreatePayload(draft: TodoDraft): CreateTodoPayload {
  return {
    description: draft.description || null,
    title: draft.title.trim()
  };
}

export function toUpdatePayload(draft: TodoDraft, current: TodoItem): UpdateTodoPayload {
  const title = draft.title.trim();

  return {
    completed: current.completed,
    description: draft.description || null,
    title
  };
}
