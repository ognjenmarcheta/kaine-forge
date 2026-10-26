const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 255;

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
