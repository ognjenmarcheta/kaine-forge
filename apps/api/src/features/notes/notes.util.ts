import { NOTES_CONFIG } from "./notes.config";
import type { Pagination, PaginationInput } from "./notes.type";

const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 255;

export function coercePagination(input: PaginationInput): Pagination {
  const rawLimit = input.limit ?? NOTES_CONFIG.pagination.defaultLimit;
  const rawOffset = input.offset ?? 0;
  const limit = Math.min(NOTES_CONFIG.pagination.maxLimit, Math.max(1, Math.floor(rawLimit)));
  const offset = Math.max(0, Math.floor(rawOffset));
  return { limit, offset };
}

export function ensureNoteTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH) throw new Error("note title is required");
  if (trimmed.length > MAX_TITLE_LENGTH) throw new Error("note title is too long");
  return trimmed;
}

export function parseOptionalBody(body?: string | null): string | null {
  if (body == null) return null;
  const trimmed = body.trim();
  return trimmed.length === 0 ? null : trimmed;
}
