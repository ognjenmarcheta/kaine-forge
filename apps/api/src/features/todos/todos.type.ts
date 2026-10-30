export interface CreateTodoInput {
  /** Internal only — a client-generated id from a sync push. */
  id?: string | undefined;
  title: string;
  description?: string | null;
  /** Internal only — never part of the GraphQL CreateTodoInput. */
  noteId?: string | null | undefined;
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
