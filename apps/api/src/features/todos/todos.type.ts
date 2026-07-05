export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface Pagination {
  limit: number;
  offset: number;
}

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  noteId?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  completed?: boolean;
}

export interface TodoPatch {
  title?: string;
  description?: string | null;
  completed?: boolean;
  noteId?: string | null;
}
