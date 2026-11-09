import type { Note } from "@repo/db";

import {
  countNotesByScope,
  createNote,
  createNoteWithId,
  deleteNote,
  getNoteById,
  listNotesByScope,
  updateNote
} from "./notes.adapter";
import type { CreateNoteInput, NotePatch, UpdateNoteInput } from "./notes.type";
import { ensureNoteTitle, parseOptionalBody } from "./notes.util";
import type { Connection, PageInput, ScopedData } from "../../context.data";
import type { PubSubEventMap, RecordOrganizationEvent } from "../../pubsub";

export interface NoteListArgs extends PageInput {
  search?: string | null | undefined;
}

export interface NoteModuleDeps {
  data: ScopedData;
  /** Streams an event to live subscribers; call it after the write commits. */
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  recordEvent: RecordOrganizationEvent;
}

/**
 * Every Note read and write for one request's Authenticated Organization
 * Scope. Writes normalize their input, record one `note:*` event in the
 * write's transaction, and publish it after the commit.
 */
export interface Notes {
  list: (args: NoteListArgs) => Promise<Connection<Note>>;
  get: (id: string) => Promise<Note | null>;
  /** How many Notes are in the scope. */
  count: () => Promise<number>;
  /**
   * Throws `note title is required`/`too long` before any write. With an `id`,
   * an existing Note by the same author is returned unchanged and unpublished;
   * any other row with it throws `note id conflict`.
   */
  create: (input: CreateNoteInput) => Promise<Note>;
  /** Throws `note not found` when no Note with this id is in the scope. */
  update: (id: string, input: UpdateNoteInput) => Promise<Note>;
  /** Publishes `note:deleted` only when a row was deleted. */
  delete: (id: string) => Promise<boolean>;
}

export function createNotes({ data, publish, recordEvent }: NoteModuleDeps): Notes {
  return {
    list: ({ search, ...page }) => listNotesByScope(data, page, search),
    get: (id) => getNoteById(data, id),
    count: () => countNotesByScope(data),
    async create(input) {
      data.authorize("note:create");
      const fields = {
        title: ensureNoteTitle(input.title),
        body: parseOptionalBody(input.body ?? null)
      };

      if (input.id !== undefined) {
        const { id } = input;
        const inserted = await data.transaction(async (tx) => {
          const note = await createNoteWithId(tx, { ...fields, id });
          if (note) await recordEvent(tx, "note:created", note);
          return note;
        });
        if (!inserted) {
          // The same author creating the same id again is a replayed push.
          const existing = await getNoteById(data, id);
          if (existing?.userId === data.stamp("userId").userId) {
            return existing;
          }
          throw new Error("note id conflict");
        }
        publish("note:created", inserted);
        return inserted;
      }

      const note = await data.transaction(async (tx) => {
        const created = await createNote(tx, fields);
        await recordEvent(tx, "note:created", created);
        return created;
      });
      publish("note:created", note);
      return note;
    },
    async update(id, input) {
      data.authorize("note:update");
      const patch: NotePatch = {};
      if (input.title !== undefined) patch.title = ensureNoteTitle(input.title);
      if (input.body !== undefined) patch.body = parseOptionalBody(input.body);
      const note = await data.transaction(async (tx) => {
        const updated = await updateNote(tx, id, patch);
        await recordEvent(tx, "note:updated", updated);
        return updated;
      });
      publish("note:updated", note);
      return note;
    },
    async delete(id) {
      data.authorize("note:delete");
      const event = { id, organizationId: data.stamp().organizationId };
      const deleted = await data.transaction(async (tx) => {
        const removed = await deleteNote(tx, id);
        if (removed) await recordEvent(tx, "note:deleted", event);
        return removed;
      });
      if (deleted) {
        publish("note:deleted", event);
      }
      return deleted;
    }
  };
}
