import type { Todo } from "@repo/db";
import { notesTable, todosTable } from "@repo/db/schema";
import type { Logger } from "@repo/logger";
import { desc, eq, inArray } from "drizzle-orm";

import { TODOS_CONFIG } from "./todos.config";
import type { CreateTodoInput, TodoPatch, UpdateTodoInput } from "./todos.type";
import { applyTodoPatch, ensureTodoTitle, parseOptionalDescription } from "./todos.util";
import {
  containsPhrase,
  type Connection,
  type PageInput,
  type ScopedData
} from "../../context.data";
import { formatLoggableError } from "../../observability";
import type { PubSubEventMap } from "../../pubsub";

export interface TodoListArgs extends PageInput {
  search?: string | null | undefined;
  completed?: boolean | null | undefined;
}

/**
 * What deleting a Todo does to its Attachments. `detach` soft-deletes their
 * rows; the purge it returns deletes their stored objects, bounds each delete
 * in time, logs its own failures, and never rejects.
 */
export interface TodoAttachments {
  detach: (todoId: string) => Promise<{ purge: () => Promise<void> }>;
}

export interface TodoModuleDeps {
  attachments: TodoAttachments;
  data: ScopedData;
  logger: Pick<Logger, "warn">;
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

/**
 * Every Todo read and write for one request's Authenticated Organization
 * Scope. Writes normalize their input and publish one `todo:*` event; delete
 * also cleans up the Todo's Attachments.
 */
export interface Todos {
  list: (args: TodoListArgs) => Promise<Connection<Todo>>;
  get: (id: string) => Promise<Todo | null>;
  /** Every Todo of the given Notes, newest first, unpaginated (for the batch loader). */
  listByNoteIds: (noteIds: readonly string[]) => Promise<Todo[]>;
  /** Throws `todo title is required`/`too long`, or `note not found` for a Note outside the scope. */
  create: (input: CreateTodoInput) => Promise<Todo>;
  /** Throws `todo not found` when no Todo with this id is in the scope. */
  update: (id: string, input: UpdateTodoInput) => Promise<Todo>;
  /** Throws `todo not found` when no Todo with this id is in the scope. */
  toggle: (id: string) => Promise<Todo>;
  /**
   * Soft-deletes the Attachment rows, deletes the Todo, publishes `todo:deleted`
   * when a row was deleted, then purges the objects in the background. An
   * Attachment failure is logged and never fails or delays the delete.
   */
  delete: (id: string) => Promise<boolean>;
}

export function createTodos({ attachments, data, logger, publish }: TodoModuleDeps): Todos {
  async function get(id: string): Promise<Todo | null> {
    const todos = await data.selectFrom(todosTable, eq(todosTable.id, id)).limit(1);
    return todos[0] ?? null;
  }

  async function write(id: string, patch: TodoPatch): Promise<Todo> {
    const todos = await data
      .update(todosTable, { ...patch, updatedAt: new Date() }, eq(todosTable.id, id))
      .returning();
    const todo = todos[0];

    if (!todo) {
      throw new Error("todo not found");
    }

    return todo;
  }

  function warnCleanupFailed(err: unknown, todoId: string): void {
    // `error`, not `err`: pino's default serializer would copy every
    // enumerable property of the error onto the record. See observability.ts.
    logger.warn({ error: formatLoggableError(err), todoId }, "failed to clean up todo attachments");
  }

  return {
    list: ({ search, completed, ...page }) =>
      data.page(
        todosTable,
        page,
        { orderBy: todosTable.createdAt, direction: "desc", limits: TODOS_CONFIG.pagination },
        containsPhrase(search, [todosTable.title, todosTable.description]),
        typeof completed === "boolean" ? eq(todosTable.completed, completed) : undefined
      ),
    get,
    async listByNoteIds(noteIds) {
      if (noteIds.length === 0) {
        return [];
      }

      return data
        .selectFrom(todosTable, inArray(todosTable.noteId, [...noteIds]))
        .orderBy(desc(todosTable.createdAt));
    },
    async create(input) {
      data.authorize("todo:create");
      const title = ensureTodoTitle(input.title);
      const description = parseOptionalDescription(input.description ?? null);
      const noteId = input.noteId ?? null;

      if (noteId) {
        const notes = await data.selectFrom(notesTable, eq(notesTable.id, noteId)).limit(1);

        if (!notes[0]) {
          throw new Error("note not found");
        }
      }

      const todos = await data
        .insert(todosTable)
        .values({ ...data.stamp("userId"), title, description, completed: false, noteId })
        .returning();
      const todo = todos[0];

      if (!todo) {
        throw new Error("failed to create todo");
      }

      publish("todo:created", todo);
      return todo;
    },
    async update(id, input) {
      data.authorize("todo:update");
      const todo = await write(id, applyTodoPatch(input));
      publish("todo:updated", todo);
      return todo;
    },
    async toggle(id) {
      data.authorize("todo:update");
      const current = await get(id);

      if (!current) {
        throw new Error("todo not found");
      }

      const todo = await write(id, { completed: !current.completed });
      publish("todo:toggled", todo);
      return todo;
    },
    async delete(id) {
      data.authorize("todo:delete");
      let purge: () => Promise<void> = async () => undefined;
      try {
        ({ purge } = await attachments.detach(id));
      } catch (err) {
        warnCleanupFailed(err, id);
      }

      const deleted = await data
        .delete(todosTable, eq(todosTable.id, id))
        .returning({ id: todosTable.id, organizationId: todosTable.organizationId });
      const row = deleted[0];

      if (row) {
        publish("todo:deleted", row);
      }

      // Objects go last, off the response path: a slow or failing object
      // store must not delay or undo the Todo delete (issue #602).
      void purge();

      return row !== undefined;
    }
  };
}
