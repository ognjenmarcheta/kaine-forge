import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type { FilesFilterInput } from "./storage.type";

export const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const;

interface AttachmentLifecycleAdapter<TAttachment> {
  deleteFilesByEntity: (
    scope: AuthenticatedOrganizationScope,
    entityType: string,
    entityId: string
  ) => Promise<TAttachment[]>;
  listFiles: (
    scope: AuthenticatedOrganizationScope,
    filter: FilesFilterInput
  ) => Promise<TAttachment[]>;
}

export function createAttachmentLifecycle<TAttachment>(
  adapter: AttachmentLifecycleAdapter<TAttachment>
) {
  return {
    deleteTodoAttachments(scope: AuthenticatedOrganizationScope, todoId: string) {
      return adapter.deleteFilesByEntity(scope, ATTACHMENT_ENTITY_TYPES.todo, todoId);
    },
    listTodoAttachments(scope: AuthenticatedOrganizationScope, todoId: string) {
      return adapter.listFiles(scope, {
        entityType: ATTACHMENT_ENTITY_TYPES.todo,
        entityId: todoId,
        status: "uploaded"
      });
    }
  };
}
