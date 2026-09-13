import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { db, notesTable, todosTable, type Todo } from "@repo/db";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type { Pagination, TodoPatch } from "./todos.type";

export async function listTodosByScope(
  scope: AuthenticatedOrganizationScope,
  pagination: Pagination,
  filters: { search?: string | null; completed?: boolean | null } = {}
): Promise<Todo[]> {
  const phrase = filters.search?.trim();
  const pattern = phrase ? `%${phrase.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  return db
    .select()
    .from(todosTable)
    .where(
      and(
        eq(todosTable.organizationId, scope.organizationId),
        pattern === undefined
          ? undefined
          : or(ilike(todosTable.title, pattern), ilike(todosTable.description, pattern)),
        typeof filters.completed === "boolean"
          ? eq(todosTable.completed, filters.completed)
          : undefined
      )
    )
    .orderBy(desc(todosTable.createdAt), desc(todosTable.id))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function getTodoById(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<Todo | null> {
  const todos = await db
    .select()
    .from(todosTable)
    .where(and(eq(todosTable.id, id), eq(todosTable.organizationId, scope.organizationId)))
    .limit(1);

  return todos[0] ?? null;
}

export async function createTodo(
  scope: AuthenticatedOrganizationScope,
  input: { title: string; description: string | null; noteId?: string | null }
): Promise<Todo> {
  if (input.noteId) {
    const notes = await db
      .select({ id: notesTable.id })
      .from(notesTable)
      .where(
        and(eq(notesTable.id, input.noteId), eq(notesTable.organizationId, scope.organizationId))
      )
      .limit(1);

    if (!notes[0]) {
      throw new Error("note not found");
    }
  }

  const todos = await db
    .insert(todosTable)
    .values({
      userId: scope.userId,
      organizationId: scope.organizationId,
      title: input.title,
      description: input.description,
      completed: false,
      noteId: input.noteId ?? null
    })
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("failed to create todo");
  }

  return todo;
}

export async function updateTodo(
  scope: AuthenticatedOrganizationScope,
  id: string,
  patch: TodoPatch
): Promise<Todo> {
  const todos = await db
    .update(todosTable)
    .set({
      ...patch,
      updatedAt: new Date()
    })
    .where(and(eq(todosTable.id, id), eq(todosTable.organizationId, scope.organizationId)))
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("todo not found");
  }

  return todo;
}

export async function deleteTodo(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<boolean> {
  const deleted = await db
    .delete(todosTable)
    .where(and(eq(todosTable.id, id), eq(todosTable.organizationId, scope.organizationId)))
    .returning({ id: todosTable.id });

  return deleted.length > 0;
}

export async function listTodosByNoteIds(
  scope: AuthenticatedOrganizationScope,
  noteIds: string[]
): Promise<Todo[]> {
  if (noteIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(todosTable)
    .where(
      and(inArray(todosTable.noteId, noteIds), eq(todosTable.organizationId, scope.organizationId))
    )
    .orderBy(desc(todosTable.createdAt));
}

export async function toggleTodo(scope: AuthenticatedOrganizationScope, id: string): Promise<Todo> {
  const current = await getTodoById(scope, id);

  if (!current) {
    throw new Error("todo not found");
  }

  return updateTodo(scope, id, {
    completed: !current.completed
  });
}
