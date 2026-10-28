import type { Note } from "@repo/db";

import {
  countNotesByScope,
  createNote,
  deleteNote,
  getNoteById,
  listNotesByScope,
  updateNote
} from "./notes.adapter";
import type { CreateNoteInput, NotePatch, UpdateNoteInput } from "./notes.type";
import { ensureNoteTitle, parseOptionalBody } from "./notes.util";
import type { Connection, PageInput, ScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";

export interface NoteListArgs extends PageInput {
  search?: string | null | undefined;
}

export interface NoteModuleDeps {
  data: ScopedData;
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

/**
 * Every Note read and write for one request's Authenticated Organization
 * Scope. Writes normalize their input and publish one `note:*` event.
 */
export interface Notes {
  list: (args: NoteListArgs) => Promise<Connection<Note>>;
  get: (id: string) => Promise<Note | null>;
  /** How many Notes are in the scope. */
  count: () => Promise<number>;
  /** Throws `note title is required`/`too long` before any write. */
  create: (input: CreateNoteInput) => Promise<Note>;
  /** Throws `note not found` when no Note with this id is in the scope. */
  update: (id: string, input: UpdateNoteInput) => Promise<Note>;
  /** Publishes `note:deleted` only when a row was deleted. */
  delete: (id: string) => Promise<boolean>;
}

export function createNotes({ data, publish }: NoteModuleDeps): Notes {
  return {
    list: ({ search, ...page }) => listNotesByScope(data, page, search),
    get: (id) => getNoteById(data, id),
    count: () => countNotesByScope(data),
    async create(input) {
      data.authorize("note:create");
      const note = await createNote(data, {
        title: ensureNoteTitle(input.title),
        body: parseOptionalBody(input.body ?? null)
      });
      publish("note:created", note);
      return note;
    },
    async update(id, input) {
      data.authorize("note:update");
      const patch: NotePatch = {};
      if (input.title !== undefined) patch.title = ensureNoteTitle(input.title);
      if (input.body !== undefined) patch.body = parseOptionalBody(input.body);
      const note = await updateNote(data, id, patch);
      publish("note:updated", note);
      return note;
    },
    async delete(id) {
      data.authorize("note:delete");
      const deleted = await deleteNote(data, id);
      if (deleted) {
        publish("note:deleted", { id, organizationId: data.stamp().organizationId });
      }
      return deleted;
    }
  };
}
