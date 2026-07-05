export interface Pagination {
  limit: number;
  offset: number;
}
export interface PaginationInput {
  limit?: number;
  offset?: number;
}
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
