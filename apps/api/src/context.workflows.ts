import type { Logger } from "@repo/logger";

import { createNote, deleteNote, updateNote } from "./features/notes/notes.adapter";
import { createNoteWorkflow } from "./features/notes/notes.workflow";
import { createAttachmentLifecycle } from "./features/storage/attachment.lifecycle";
import { deleteFilesByEntity, listFiles } from "./features/storage/storage.adapter";
import { createTodo, deleteTodo, toggleTodo, updateTodo } from "./features/todos/todos.adapter";
import { createTodoWorkflow } from "./features/todos/todos.workflow";
import { formatLoggableError } from "./observability";
import type { PubSubEventMap } from "./pubsub";

export interface ApiWorkflowDeps {
  logger: Logger;
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

export interface ApiWorkflows {
  note: ReturnType<typeof createNoteWorkflow>;
  todo: ReturnType<typeof createTodoWorkflow>;
}

/**
 * Every write that must honour a domain guard goes through here.
 *
 * The workflows live on the request context rather than inside a feature router
 * because more than one feature writes todos: the todos resolvers, the notes
 * `addTodoToNote` mutation, and the assistant's tools. Building them per router
 * left two of those three calling `todos.adapter` directly, which skipped
 * attachment cleanup on delete and title normalization on create (issue #393).
 *
 * Mirrors `context.loaders.ts`: a module, an interface, and a per-request
 * factory. It also matters that this file is imported by `context.ts`, which
 * already loads `@repo/db` — a feature router importing it as a value instead
 * would pull the database into test files that deliberately load none.
 */
export function createApiWorkflows({ logger, publish }: ApiWorkflowDeps): ApiWorkflows {
  const attachmentLifecycle = createAttachmentLifecycle({ deleteFilesByEntity, listFiles });

  return {
    note: createNoteWorkflow({
      createNote,
      deleteNote,
      publishNoteEvent: publish,
      updateNote
    }),
    todo: createTodoWorkflow({
      createTodo,
      deleteTodo,
      deleteTodoAttachments: async (scope, id) => {
        await attachmentLifecycle.deleteTodoAttachments(scope, id);
      },
      publishTodoEvent: publish,
      toggleTodo,
      updateTodo,
      warnTodoAttachmentCleanupFailed: ({ err, todoId }) => {
        // `error`, not `err`: pino's default serializer would copy every
        // enumerable property of the error onto the record. See observability.ts.
        logger.warn(
          { error: formatLoggableError(err), todoId },
          "failed to soft-delete todo attachments"
        );
      }
    })
  };
}
