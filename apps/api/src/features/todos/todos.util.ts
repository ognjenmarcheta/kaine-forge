import { TODOS_DEFINITIONS } from "./todos.definition";
import type { Pagination, PaginationInput, TodoPatch, UpdateTodoInput } from "./todos.type";

export function coercePagination(
  input: PaginationInput,
  config: { defaultLimit: number; maxLimit: number }
): Pagination {
  const rawLimit = input.limit ?? config.defaultLimit;
  const rawOffset = input.offset ?? 0;

  const limit = Math.min(config.maxLimit, Math.max(1, Math.floor(rawLimit)));
  const offset = Math.max(0, Math.floor(rawOffset));

  return { limit, offset };
}

export function ensureTodoTitle(title: string): string {
  const trimmed = title.trim();

  if (trimmed.length < TODOS_DEFINITIONS.MIN_TITLE_LENGTH) {
    throw new Error("todo title is required");
  }

  if (trimmed.length > TODOS_DEFINITIONS.MAX_TITLE_LENGTH) {
    throw new Error("todo title is too long");
  }

  return trimmed;
}

export function parseOptionalDescription(description?: string | null): string | null {
  if (description == null) {
    return null;
  }

  const trimmed = description.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function applyTodoPatch(input: UpdateTodoInput & Record<string, unknown>): TodoPatch {
  const patch: TodoPatch = {};

  if (typeof input.title === "string") {
    patch.title = ensureTodoTitle(input.title);
  }

  if ("description" in input) {
    patch.description = parseOptionalDescription(input.description ?? null);
  }

  if (typeof input.completed === "boolean") {
    patch.completed = input.completed;
  }

  return patch;
}
