import type { SyncNote, SyncTodo } from "@repo/sync";

/** A Note row from the local sync collection. */
export type NoteListItem = SyncNote;
/** A Note with its checklist: the Todos linked to it, newest first. */
export type NoteDetail = SyncNote & { todos: NoteTodo[] };
export type NoteTodo = SyncTodo;

export interface NoteDraft {
  title: string;
  body: string;
  baseTitle: string;
  baseBody: string;
  /** The Note's id once saved; a client id, so it exists before the server has it. */
  serverId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  deleted: boolean;
}
