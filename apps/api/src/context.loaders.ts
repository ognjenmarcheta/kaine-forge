import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { File, Todo } from "@repo/db";
import DataLoader from "dataloader";

import { ATTACHMENT_ENTITY_TYPES } from "./features/storage/attachment.lifecycle";
import { listFilesByEntityIds } from "./features/storage/storage.adapter";
import { listTodosByNoteIds } from "./features/todos/todos.adapter";

export interface ApiLoaders {
  noteTodos: DataLoader<string, Todo[]>;
  todoAttachments: DataLoader<string, File[]>;
}

interface LoaderAdapter {
  listFilesByEntityIds: typeof listFilesByEntityIds;
  listTodosByNoteIds: typeof listTodosByNoteIds;
}

const defaultAdapter: LoaderAdapter = {
  listFilesByEntityIds,
  listTodosByNoteIds
};

// Loaders are created per request so field resolvers batch their fan-out into
// one organization-scoped query instead of one query per parent row.
export function createApiLoaders(
  requireOrganizationScope: () => AuthenticatedOrganizationScope,
  adapter: LoaderAdapter = defaultAdapter
): ApiLoaders {
  return {
    noteTodos: new DataLoader(async (noteIds) => {
      const scope = requireOrganizationScope();
      const todos = await adapter.listTodosByNoteIds(scope, [...noteIds]);
      const byNoteId = new Map<string, Todo[]>();

      for (const todo of todos) {
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
      const scope = requireOrganizationScope();
      const files = await adapter.listFilesByEntityIds(
        scope,
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
