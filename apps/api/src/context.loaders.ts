import type { File, Todo } from "@repo/db";
import DataLoader from "dataloader";

import type { ScopedData } from "./context.data";
import { ATTACHMENT_ENTITY_TYPES } from "./features/storage/attachment.lifecycle";
import { listFilesByEntityIds } from "./features/storage/storage.adapter";
import type { Todos } from "./features/todos/todos.module";

export interface ApiLoaders {
  noteTodos: DataLoader<string, Todo[]>;
  todoAttachments: DataLoader<string, File[]>;
}

interface LoaderAdapter {
  listFilesByEntityIds: typeof listFilesByEntityIds;
}

const defaultAdapter: LoaderAdapter = {
  listFilesByEntityIds
};

// Loaders are created per request so field resolvers batch their fan-out into
// one organization-scoped query instead of one query per parent row.
export function createApiLoaders(
  data: ScopedData,
  todos: Pick<Todos, "listByNoteIds">,
  adapter: LoaderAdapter = defaultAdapter
): ApiLoaders {
  return {
    noteTodos: new DataLoader(async (noteIds) => {
      const byNoteId = new Map<string, Todo[]>();

      for (const todo of await todos.listByNoteIds(noteIds)) {
        if (!todo.noteId) {
          continue;
        }
        const group = byNoteId.get(todo.noteId);
        if (group) {
          group.push(todo);
        } else {
          byNoteId.set(todo.noteId, [todo]);
        }
      }

      return noteIds.map((noteId) => byNoteId.get(noteId) ?? []);
    }),
    todoAttachments: new DataLoader(async (todoIds) => {
      const files = await adapter.listFilesByEntityIds(
        data,
        ATTACHMENT_ENTITY_TYPES.todo,
        [...todoIds],
        "uploaded"
      );
      const byTodoId = new Map<string, File[]>();

      for (const file of files) {
        if (!file.entityId) {
          continue;
        }
        const group = byTodoId.get(file.entityId);
        if (group) {
          group.push(file);
        } else {
          byTodoId.set(file.entityId, [file]);
        }
      }

      return todoIds.map((todoId) => byTodoId.get(todoId) ?? []);
    })
  };
}
