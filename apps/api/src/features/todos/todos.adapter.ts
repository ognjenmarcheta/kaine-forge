import { db, todosTable, type Todo } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

import type { Pagination, TodoPatch } from "./todos.type";

export async function listTodosByUserIdAndOrganizationId(
  userId: string,
  organizationId: string,
  pagination: Pagination
): Promise<Todo[]> {
  return db
    .select()
    .from(todosTable)
    .where(and(eq(todosTable.userId, userId), eq(todosTable.organizationId, organizationId)))
    .orderBy(desc(todosTable.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function getTodoById(
  userId: string,
  organizationId: string,
  id: string
): Promise<Todo | null> {
  const todos = await db
    .select()
    .from(todosTable)
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, userId),
        eq(todosTable.organizationId, organizationId)
      )
    )
    .limit(1);

  return todos[0] ?? null;
}

export async function createTodo(
  userId: string,
  organizationId: string,
  input: { title: string; description: string | null }
): Promise<Todo> {
  const todos = await db
    .insert(todosTable)
    .values({
      userId,
      organizationId,
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

export async function updateTodo(
  userId: string,
  organizationId: string,
  id: string,
  patch: TodoPatch
): Promise<Todo> {
  const todos = await db
    .update(todosTable)
    .set({
      ...patch,
      updatedAt: new Date()
    })
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, userId),
        eq(todosTable.organizationId, organizationId)
      )
    )
    .returning();

  const todo = todos[0];

  if (!todo) {
    throw new Error("todo not found");
  }

  return todo;
}

export async function deleteTodo(
  userId: string,
  organizationId: string,
  id: string
): Promise<boolean> {
  const deleted = await db
    .delete(todosTable)
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, userId),
        eq(todosTable.organizationId, organizationId)
      )
    )
    .returning({ id: todosTable.id });

  return deleted.length > 0;
}

export async function toggleTodo(
  userId: string,
  organizationId: string,
  id: string
): Promise<Todo> {
  const current = await getTodoById(userId, organizationId, id);

  if (!current) {
    throw new Error("todo not found");
  }

  return updateTodo(userId, organizationId, id, {
    completed: !current.completed
  });
}
