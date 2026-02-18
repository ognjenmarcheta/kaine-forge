import type { TodoDraft } from "./todos.type";

export const TODO_DEFINITION = {
  emptyDraft: {
    description: "",
    title: ""
  } satisfies TodoDraft
} as const;
