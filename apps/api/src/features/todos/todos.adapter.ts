import type { Todo } from "@repo/db";
import { notesTable, todosTable } from "@repo/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

import { TODOS_CONFIG } from "./todos.config";
import type { TodoPatch } from "./todos.type";
import {
  clampPagination,
  containsPhrase,
  type PaginationInput,
  type ScopedData
} from "../../context.data";

export async function listTodosByScope(
  data: ScopedData,
  page: PaginationInput,
  filters: { search?: string | null; completed?: boolean | null } = {}
): Promise<Todo[]> {
  const { limit, offset } = clampPagination(page, TODOS_CONFIG.pagination);
  return data
    .selectFrom(
      todosTable,
      containsPhrase(filters.search, [todosTable.title, todosTable.description]),
      typeof filters.completed === "boolean"
        ? eq(todosTable.completed, filters.completed)
        : undefined
    )
    .orderBy(desc(todosTable.createdAt), desc(todosTable.id))
    .limit(limit)
    .offset(offset);
}

export async function getTodoById(data: ScopedData, id: string): Promise<Todo | null> {
  const todos = await data.selectFrom(todosTable, eq(todosTable.id, id)).limit(1);

  return todos[0] ?? null;
}

export async function createTodo(
  data: ScopedData,
  input: { title: string; description: string | null; noteId?: string | null }
): Promise<Todo> {
  if (input.noteId) {
    const notes = await data.selectFrom(notesTable, eq(notesTable.id, input.noteId)).limit(1);

    if (!notes[0]) {
      throw new Error("note not found");
    }
  }

  const todos = await data
    .insert(todosTable)
    .values({
      ...data.stamp("userId"),
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

export async function updateTodo(data: ScopedData, id: string, patch: TodoPatch): Promise<Todo> {
  const todos = await data
    .update(todosTable, { ...patch, updatedAt: new Date() }, eq(todosTable.id, id))
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("todo not found");
  }

  return todo;
}

export async function deleteTodo(data: ScopedData, id: string): Promise<boolean> {
  const deleted = await data
    .delete(todosTable, eq(todosTable.id, id))
    .returning({ id: todosTable.id });

  return deleted.length > 0;
}

export async function listTodosByNoteIds(data: ScopedData, noteIds: string[]): Promise<Todo[]> {
  if (noteIds.length === 0) {
    return [];
  }

  return data
    .selectFrom(todosTable, inArray(todosTable.noteId, noteIds))
    .orderBy(desc(todosTable.createdAt));
}

export async function toggleTodo(data: ScopedData, id: string): Promise<Todo> {
  const current = await getTodoById(data, id);

  if (!current) {
    throw new Error("todo not found");
  }

  return updateTodo(data, id, {
    completed: !current.completed
  });
}
