import type { AttachmentEntityType } from "@repo/db";
import type { Logger } from "@repo/logger";

import { deleteFilesByEntity } from "./storage.adapter";
import type { ScopedData } from "../../context.data";
import { formatLoggableError } from "../../observability";
import type { TodoAttachments } from "../todos/todos.module";

export const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const satisfies Record<string, AttachmentEntityType>;

/**
 * A Todo's Attachments as the Todo module sees them: the rows are soft-deleted
 * when the Todo goes, and their objects are purged afterwards, best effort.
 */
export function createTodoAttachments(deps: {
  data: ScopedData;
  /** Deletes one stored object. Must settle in bounded time. */
  deleteObject: (object: { bucket: string; key: string }) => Promise<void>;
  logger: Pick<Logger, "warn">;
}): TodoAttachments {
  return {
    async detach(todoId) {
      const files = await deleteFilesByEntity(deps.data, ATTACHMENT_ENTITY_TYPES.todo, todoId);

      return {
        purge: async () => {
          await Promise.all(
            files.map(async ({ bucket, key }) => {
              try {
                await deps.deleteObject({ bucket, key });
              } catch (err) {
                // A failure leaves an orphaned object (issue #602).
                deps.logger.warn(
                  { error: formatLoggableError(err), todoId },
                  "failed to clean up todo attachments"
                );
              }
            })
          );
        }
      };
    }
  };
}
