import type { File, Todo } from "@repo/db";
import DataLoader from "dataloader";

import type { Attachments } from "./features/storage/attachment.module";
import type { Todos } from "./features/todos/todos.module";

export interface ApiLoaders {
  noteTodos: DataLoader<string, Todo[]>;
  todoAttachments: DataLoader<string, File[]>;
}

// Loaders are created per request so field resolvers batch their fan-out into
// one organization-scoped query instead of one query per parent row.
export function createApiLoaders(
  todos: Pick<Todos, "listByNoteIds">,
  attachments: Pick<Attachments, "listByTodoIds">
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
      const files = await attachments.listByTodoIds(todoIds);
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
