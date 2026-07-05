import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type { CreateNoteInput, UpdateNoteInput } from "./notes.type";
import { ensureNoteTitle, parseOptionalBody } from "./notes.util";
import type { PubSubEventMap } from "../../pubsub";

type NoteEventPayload = PubSubEventMap["note:created"][0];

export interface NoteWorkflowAdapter {
  createNote: (
    scope: AuthenticatedOrganizationScope,
    input: { title: string; body: string | null }
  ) => Promise<NoteEventPayload>;
  deleteNote: (scope: AuthenticatedOrganizationScope, id: string) => Promise<boolean>;
  publishNoteEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  updateNote: (
    scope: AuthenticatedOrganizationScope,
    id: string,
    patch: { title?: string; body?: string | null }
  ) => Promise<NoteEventPayload>;
}

export function createNoteWorkflow(adapter: NoteWorkflowAdapter) {
  return {
    async createNote(scope: AuthenticatedOrganizationScope, input: CreateNoteInput) {
      const note = await adapter.createNote(scope, {
        title: ensureNoteTitle(input.title),
        body: parseOptionalBody(input.body ?? null)
      });
      adapter.publishNoteEvent("note:created", note);
      return note;
    },
    async updateNote(scope: AuthenticatedOrganizationScope, id: string, input: UpdateNoteInput) {
      const patch: { title?: string; body?: string | null } = {};
      if (input.title !== undefined) patch.title = ensureNoteTitle(input.title);
      if (input.body !== undefined) patch.body = parseOptionalBody(input.body ?? null);
      const note = await adapter.updateNote(scope, id, patch);
      adapter.publishNoteEvent("note:updated", note);
      return note;
    },
    async deleteNote(scope: AuthenticatedOrganizationScope, id: string) {
      const deleted = await adapter.deleteNote(scope, id);
      if (deleted) {
        adapter.publishNoteEvent("note:deleted", { id, organizationId: scope.organizationId });
      }
      return deleted;
    }
  };
}
