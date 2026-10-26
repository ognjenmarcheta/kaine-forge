import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { AttachmentEntityType } from "@repo/db";

export const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const satisfies Record<string, AttachmentEntityType>;

interface AttachmentLifecycleAdapter<TAttachment> {
  deleteFilesByEntity: (
    scope: AuthenticatedOrganizationScope,
    entityType: AttachmentEntityType,
    entityId: string
  ) => Promise<TAttachment[]>;
}

export function createAttachmentLifecycle<TAttachment>(
  adapter: AttachmentLifecycleAdapter<TAttachment>
) {
  return {
    deleteTodoAttachments(scope: AuthenticatedOrganizationScope, todoId: string) {
      return adapter.deleteFilesByEntity(scope, ATTACHMENT_ENTITY_TYPES.todo, todoId);
    }
  };
}
