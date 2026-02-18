import { db, todosTable, type Todo } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

import type { Pagination, TodoPatch } from "./todos.type";

export async function listTodosByUserId(userId: string, pagination: Pagination): Promise<Todo[]> {
  return db
    .select()
    .from(todosTable)
    .where(eq(todosTable.userId, userId))
    .orderBy(desc(todosTable.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function getTodoById(userId: string, id: string): Promise<Todo | null> {
  const todos = await db
    .select()
    .from(todosTable)
    .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
    .limit(1);

  return todos[0] ?? null;
}

export async function createTodo(
  userId: string,
  input: { title: string; description: string | null }
): Promise<Todo> {
  const todos = await db
    .insert(todosTable)
    .values({
      userId,
      title: input.title,
      description: input.description,
      completed: false
    })
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("failed to create todo");
  }

  return todo;
}

export async function updateTodo(userId: string, id: string, patch: TodoPatch): Promise<Todo> {
  const todos = await db
    .update(todosTable)
    .set({
      ...patch,
      updatedAt: new Date()
    })
    .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("todo not found");
  }

  return todo;
}

export async function deleteTodo(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(todosTable)
    .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)))
    .returning({ id: todosTable.id });

  return deleted.length > 0;
}

export async function toggleTodo(userId: string, id: string): Promise<Todo> {
  const current = await getTodoById(userId, id);

  if (!current) {
    throw new Error("todo not found");
  }

  return updateTodo(userId, id, {
    completed: !current.completed
  });
}
