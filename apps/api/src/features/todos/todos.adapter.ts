import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { db, todosTable, type Todo } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

import type { Pagination, TodoPatch } from "./todos.type";

export async function listTodosByScope(
  scope: AuthenticatedOrganizationScope,
  pagination: Pagination
): Promise<Todo[]> {
  return db
    .select()
    .from(todosTable)
    .where(
      and(eq(todosTable.userId, scope.userId), eq(todosTable.organizationId, scope.organizationId))
    )
    .orderBy(desc(todosTable.createdAt))
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
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, scope.userId),
        eq(todosTable.organizationId, scope.organizationId)
      )
    )
    .limit(1);

  return todos[0] ?? null;
}

export async function createTodo(
  scope: AuthenticatedOrganizationScope,
  input: { title: string; description: string | null }
): Promise<Todo> {
  const todos = await db
    .insert(todosTable)
    .values({
      userId: scope.userId,
      organizationId: scope.organizationId,
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
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, scope.userId),
        eq(todosTable.organizationId, scope.organizationId)
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
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<boolean> {
  const deleted = await db
    .delete(todosTable)
    .where(
      and(
        eq(todosTable.id, id),
        eq(todosTable.userId, scope.userId),
        eq(todosTable.organizationId, scope.organizationId)
      )
    )
    .returning({ id: todosTable.id });

  return deleted.length > 0;
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
