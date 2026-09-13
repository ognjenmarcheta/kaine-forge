import type { TodoDraft } from "./todos.type";

export function validTodo(draft: TodoDraft) {
  const length = draft.title.trim().length;
  return length > 0 && length <= 255;
}

export function sameTodoText(left: TodoDraft, right: TodoDraft) {
  return (
    left.title.trim() === right.title.trim() && left.description.trim() === right.description.trim()
  );
}

export function todoStatus(value: string | null) {
  return value === "open" || value === "completed" ? value : "all";
}
