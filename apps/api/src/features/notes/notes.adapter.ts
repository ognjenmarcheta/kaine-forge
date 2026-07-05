import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { db, notesTable, type Note } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

import type { NotePatch, Pagination } from "./notes.type";

export async function listNotesByScope(
  scope: AuthenticatedOrganizationScope,
  pagination: Pagination
): Promise<Note[]> {
  return db
    .select()
    .from(notesTable)
    .where(and(eq(notesTable.organizationId, scope.organizationId)))
    .orderBy(desc(notesTable.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function getNoteById(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<Note | null> {
  const rows = await db
    .select()
    .from(notesTable)
    .where(and(eq(notesTable.id, id), eq(notesTable.organizationId, scope.organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createNote(
  scope: AuthenticatedOrganizationScope,
  input: { title: string; body: string | null }
): Promise<Note> {
  const rows = await db
    .insert(notesTable)
    .values({
      userId: scope.userId,
      organizationId: scope.organizationId,
      title: input.title,
      body: input.body
    })
    .returning();
  const note = rows[0];
  if (!note) throw new Error("failed to create note");
  return note;
}

export async function updateNote(
  scope: AuthenticatedOrganizationScope,
  id: string,
  patch: NotePatch
): Promise<Note> {
  const rows = await db
    .update(notesTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(notesTable.id, id), eq(notesTable.organizationId, scope.organizationId)))
    .returning();
  const note = rows[0];
  if (!note) throw new Error("note not found");
  return note;
}

export async function deleteNote(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<boolean> {
  const rows = await db
    .delete(notesTable)
    .where(and(eq(notesTable.id, id), eq(notesTable.organizationId, scope.organizationId)))
    .returning({ id: notesTable.id });
  return rows.length > 0;
}
