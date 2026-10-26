export interface CreateNoteInput {
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
