import type { AttachmentEntityType } from "@repo/db";

import type { ScopedData } from "../../context.data";

export const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const satisfies Record<string, AttachmentEntityType>;

interface AttachmentLifecycleAdapter<TAttachment> {
  deleteFilesByEntity: (
    data: ScopedData,
    entityType: AttachmentEntityType,
    entityId: string
  ) => Promise<TAttachment[]>;
}

export function createAttachmentLifecycle<TAttachment>(
  adapter: AttachmentLifecycleAdapter<TAttachment>
) {
  return {
    deleteTodoAttachments(data: ScopedData, todoId: string) {
      return adapter.deleteFilesByEntity(data, ATTACHMENT_ENTITY_TYPES.todo, todoId);
    }
  };
}
