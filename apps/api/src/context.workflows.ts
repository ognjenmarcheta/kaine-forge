import type { Logger } from "@repo/logger";

import type { ScopedData } from "./context.data";
import { createNote, deleteNote, updateNote } from "./features/notes/notes.adapter";
import { createNoteWorkflow } from "./features/notes/notes.workflow";
import { createAttachmentLifecycle } from "./features/storage/attachment.lifecycle";
import { deleteFilesByEntity } from "./features/storage/storage.adapter";
import { deleteStorageObject } from "./features/storage/storage.runtime";
import { createTodo, deleteTodo, toggleTodo, updateTodo } from "./features/todos/todos.adapter";
import { createTodoWorkflow } from "./features/todos/todos.workflow";
import { formatLoggableError } from "./observability";
import type { PubSubEventMap } from "./pubsub";

export interface ApiWorkflowDeps {
  data: ScopedData;
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
export function createApiWorkflows({ data, logger, publish }: ApiWorkflowDeps): ApiWorkflows {
  const attachmentLifecycle = createAttachmentLifecycle({ deleteFilesByEntity });

  return {
    note: createNoteWorkflow({
      createNote: (_scope, input) => createNote(data, input),
      deleteNote: (_scope, id) => deleteNote(data, id),
      publishNoteEvent: publish,
      updateNote: (_scope, id, patch) => updateNote(data, id, patch)
    }),
    todo: createTodoWorkflow({
      createTodo: (_scope, input) => createTodo(data, input),
      deleteAttachmentObject: ({ bucket, key }) => deleteStorageObject(bucket, key),
      deleteTodo: (_scope, id) => deleteTodo(data, id),
      deleteTodoAttachments: async (_scope, id) => {
        const files = await attachmentLifecycle.deleteTodoAttachments(data, id);
        return files.map(({ bucket, key }) => ({ bucket, key }));
      },
      publishTodoEvent: publish,
      toggleTodo: (_scope, id) => toggleTodo(data, id),
      updateTodo: (_scope, id, patch) => updateTodo(data, id, patch),
      warnTodoAttachmentCleanupFailed: ({ err, todoId }) => {
        // `error`, not `err`: pino's default serializer would copy every
        // enumerable property of the error onto the record. See observability.ts.
        logger.warn(
          { error: formatLoggableError(err), todoId },
          "failed to clean up todo attachments"
        );
      }
    })
  };
}
