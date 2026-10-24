import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type { CreateTodoInput, TodoPatch, UpdateTodoInput } from "./todos.type";
import { applyTodoPatch, ensureTodoTitle, parseOptionalDescription } from "./todos.util";
import type { PubSubEventMap } from "../../pubsub";

type TodoEventPayload =
  | PubSubEventMap["todo:created"][0]
  | PubSubEventMap["todo:updated"][0]
  | PubSubEventMap["todo:toggled"][0];

interface AttachmentObject {
  bucket: string;
  key: string;
}

export interface TodoWorkflowAdapter {
  createTodo: (
    scope: AuthenticatedOrganizationScope,
    // Required, not optional: the workflow always resolves it to a concrete
    // value, so the adapter never has to guess.
    input: { description: string | null; noteId: string | null; title: string }
  ) => Promise<TodoEventPayload>;
  deleteAttachmentObject: (object: AttachmentObject) => Promise<void>;
  deleteTodo: (scope: AuthenticatedOrganizationScope, id: string) => Promise<boolean>;
  /** Soft-deletes the Todo's Attachment rows and returns the objects they point to. */
  deleteTodoAttachments: (
    scope: AuthenticatedOrganizationScope,
    id: string
  ) => Promise<AttachmentObject[]>;
  publishTodoEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  toggleTodo: (scope: AuthenticatedOrganizationScope, id: string) => Promise<TodoEventPayload>;
  updateTodo: (
    scope: AuthenticatedOrganizationScope,
    id: string,
    patch: TodoPatch
  ) => Promise<TodoEventPayload>;
  warnTodoAttachmentCleanupFailed: (input: { err: unknown; todoId: string }) => void;
}

export function createTodoWorkflow(adapter: TodoWorkflowAdapter) {
  return {
    async createTodo(
      scope: AuthenticatedOrganizationScope,
      input: CreateTodoInput
    ): Promise<TodoEventPayload> {
      const result = await adapter.createTodo(scope, {
        title: ensureTodoTitle(input.title),
        description: parseOptionalDescription(input.description ?? null),
        noteId: input.noteId ?? null
      });

      adapter.publishTodoEvent("todo:created", result);
      return result;
    },
    async deleteTodo(scope: AuthenticatedOrganizationScope, id: string): Promise<boolean> {
      let objects: AttachmentObject[] = [];
      try {
        objects = await adapter.deleteTodoAttachments(scope, id);
      } catch (err) {
        adapter.warnTodoAttachmentCleanupFailed({ err, todoId: id });
      }

      const result = await adapter.deleteTodo(scope, id);

      // Objects go last and best effort: an object-store outage must not block
      // or undo the Todo delete. A failure leaves an orphan (issue #602).
      for (const object of objects) {
        try {
          await adapter.deleteAttachmentObject(object);
        } catch (err) {
          adapter.warnTodoAttachmentCleanupFailed({ err, todoId: id });
        }
      }

      if (result) {
        adapter.publishTodoEvent("todo:deleted", {
          id,
          organizationId: scope.organizationId
        });
      }

      return result;
    },
    async toggleTodo(scope: AuthenticatedOrganizationScope, id: string): Promise<TodoEventPayload> {
      const result = await adapter.toggleTodo(scope, id);
      adapter.publishTodoEvent("todo:toggled", result);
      return result;
    },
    async updateTodo(
      scope: AuthenticatedOrganizationScope,
      id: string,
      input: UpdateTodoInput
    ): Promise<TodoEventPayload> {
      const result = await adapter.updateTodo(scope, id, applyTodoPatch(input));

      adapter.publishTodoEvent("todo:updated", result);
      return result;
    }
  };
}
