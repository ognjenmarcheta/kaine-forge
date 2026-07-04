import { describe, expect, it, vi } from "vitest";

import { ATTACHMENT_ENTITY_TYPES, createAttachmentLifecycle } from "./attachment.lifecycle";

const scope = {
  organizationId: "org-1",
  user: {
    email: "u1@example.com",
    emailVerified: false,
    id: "user-1",
    name: "User One"
  },
  userId: "user-1"
};

describe("attachment lifecycle", () => {
  it("lists uploaded Todo Attachments through one domain Seam", async () => {
    const listFiles = vi.fn(async () => [{ id: "file-1" }]);
    const lifecycle = createAttachmentLifecycle({
      deleteFilesByEntity: async () => [],
      listFiles
    });

    await expect(lifecycle.listTodoAttachments(scope, "todo-1")).resolves.toEqual([
      { id: "file-1" }
    ]);
    expect(listFiles).toHaveBeenCalledWith(scope, {
      entityType: ATTACHMENT_ENTITY_TYPES.todo,
      entityId: "todo-1",
      status: "uploaded"
    });
  });

  it("deletes Todo Attachments through the same association rule", async () => {
    const deleteFilesByEntity = vi.fn(async () => [{ id: "file-1" }]);
    const lifecycle = createAttachmentLifecycle({
      deleteFilesByEntity,
      listFiles: async () => []
    });

    await lifecycle.deleteTodoAttachments(scope, "todo-1");

    expect(deleteFilesByEntity).toHaveBeenCalledWith(scope, ATTACHMENT_ENTITY_TYPES.todo, "todo-1");
  });
});
