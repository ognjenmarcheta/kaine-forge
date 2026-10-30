import type { Note } from "@repo/db";
import { notesTable } from "@repo/db/schema";
import { count, eq } from "drizzle-orm";

import { NOTES_CONFIG } from "./notes.config";
import type { NotePatch } from "./notes.type";
import {
  containsPhrase,
  type Connection,
  type PageInput,
  type ScopedData
} from "../../context.data";

export async function listNotesByScope(
  data: ScopedData,
  page: PageInput,
  search?: string | null
): Promise<Connection<Note>> {
  return data.page(
    notesTable,
    page,
    { orderBy: notesTable.createdAt, direction: "desc", limits: NOTES_CONFIG.pagination },
    containsPhrase(search, [notesTable.title, notesTable.body])
  );
}

export async function getNoteById(data: ScopedData, id: string): Promise<Note | null> {
  const rows = await data.selectFrom(notesTable, eq(notesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function countNotesByScope(data: ScopedData): Promise<number> {
  const [row] = await data.aggregate(notesTable, { notes: count() });
  return row?.notes ?? 0;
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

/** Inserts a Note with a client-generated id; null when a row already has the id. */
export async function createNoteWithId(
  data: ScopedData,
  input: { id: string; title: string; body: string | null }
): Promise<Note | null> {
  const rows = await data
    .insert(notesTable)
    .values({ ...data.stamp("userId"), ...input })
    .onConflictDoNothing({ target: notesTable.id })
    .returning();
  return rows[0] ?? null;
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
