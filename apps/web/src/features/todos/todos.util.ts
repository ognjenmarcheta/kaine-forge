import type { TodoDraft, TodoItem } from "./todos.type";

export function toCreatePayload(draft: TodoDraft): { description?: string; title: string } {
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (!description) {
    return { title };
  }

  return {
    description,
    title
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
