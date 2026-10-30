export interface CreateNoteInput {
  /** Internal only — a client-generated id from a sync push. */
  id?: string | undefined;
  title: string;
  body?: string | null;
}
export interface UpdateNoteInput {
  title?: string;
  body?: string | null;
}
export interface NotePatch {
  title?: string;
  body?: string | null;
}
