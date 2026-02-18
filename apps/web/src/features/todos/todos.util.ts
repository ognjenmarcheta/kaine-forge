import type { TodoDraft, TodoItem } from "./todos.type";

export function toCreatePayload(draft: TodoDraft): { description?: string; title: string } {
  return {
    description: draft.description.trim() || undefined,
    title: draft.title.trim()
  };
}

export function toUpdatePayload(draft: TodoDraft, original: TodoItem) {
  const payload: { completed: boolean; description?: string; title: string } = {
    completed: original.completed,
    title: draft.title.trim()
  };

  const nextDescription = draft.description.trim();

  if (nextDescription) {
    payload.description = nextDescription;
  }

  return payload;
}
