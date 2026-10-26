import type { Note } from "@repo/db";
import { notesTable } from "@repo/db/schema";
import { desc, eq } from "drizzle-orm";

import { NOTES_CONFIG } from "./notes.config";
import type { NotePatch } from "./notes.type";
import {
  clampPagination,
  containsPhrase,
  type PaginationInput,
  type ScopedData
} from "../../context.data";

export async function listNotesByScope(
  data: ScopedData,
  page: PaginationInput,
  search?: string | null
): Promise<Note[]> {
  const { limit, offset } = clampPagination(page, NOTES_CONFIG.pagination);
  return data
    .selectFrom(notesTable, containsPhrase(search, [notesTable.title, notesTable.body]))
    .orderBy(desc(notesTable.createdAt), desc(notesTable.id))
    .limit(limit)
    .offset(offset);
}

export async function getNoteById(data: ScopedData, id: string): Promise<Note | null> {
  const rows = await data.selectFrom(notesTable, eq(notesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createNote(
  data: ScopedData,
  input: { title: string; body: string | null }
): Promise<Note> {
  const rows = await data
    .insert(notesTable)
    .values({ ...data.stamp("userId"), title: input.title, body: input.body })
    .returning();
  const note = rows[0];
  if (!note) throw new Error("failed to create note");
  return note;
}

export async function updateNote(data: ScopedData, id: string, patch: NotePatch): Promise<Note> {
  const rows = await data
    .update(notesTable, { ...patch, updatedAt: new Date() }, eq(notesTable.id, id))
    .returning();
  const note = rows[0];
  if (!note) throw new Error("note not found");
  return note;
}

export async function deleteNote(data: ScopedData, id: string): Promise<boolean> {
  const rows = await data
    .delete(notesTable, eq(notesTable.id, id))
    .returning({ id: notesTable.id });
  return rows.length > 0;
}
