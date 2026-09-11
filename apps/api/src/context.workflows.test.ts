import { createLogger } from "@repo/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./features/notes/notes.adapter", () => ({
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  updateNote: vi.fn()
}));

vi.mock("./features/storage/storage.adapter", () => ({
  deleteFilesByEntity: vi.fn(),
  listFiles: vi.fn()
}));

vi.mock("./features/todos/todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  toggleTodo: vi.fn(),
  updateTodo: vi.fn()
}));

import { createApiWorkflows } from "./context.workflows";
import * as storageAdapter from "./features/storage/storage.adapter";
import * as todosAdapter from "./features/todos/todos.adapter";

const scope = {
  organizationId: "org-1",
  user: { email: "u@example.test", emailVerified: true, id: "user-1", name: "User" },
  userId: "user-1"
};

const todo = {
  completed: false,
  createdAt: new Date("2026-01-01"),
  description: null,
  id: "11111111-1111-1111-1111-111111111111",
  noteId: null,
  organizationId: "org-1",
  title: "Buy milk",
  updatedAt: new Date("2026-01-01"),
  userId: "user-1"
};

// A real logger, silenced, so no type assertion is needed and the call shape is
// the one production uses.
const logger = createLogger({ level: "silent", name: "context-workflows-test" });
const warn = vi.spyOn(logger, "warn");

const deps = () => ({ logger, publish: vi.fn() });

describe("createApiWorkflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-deletes a todo's attachments before deleting the row", async () => {
    vi.mocked(storageAdapter.deleteFilesByEntity).mockResolvedValue([]);
    vi.mocked(todosAdapter.deleteTodo).mockResolvedValue(true);

    await createApiWorkflows(deps()).todo.deleteTodo(scope, todo.id);

    // The chain that #393 bypassed: the workflow must reach the attachment
    // lifecycle, which is the only thing that marks files deleted.
    expect(storageAdapter.deleteFilesByEntity).toHaveBeenCalledWith(scope, "todo", todo.id);
    expect(todosAdapter.deleteTodo).toHaveBeenCalledWith(scope, todo.id);
  });

  it("normalizes a todo title on create and publishes once", async () => {
    vi.mocked(todosAdapter.createTodo).mockResolvedValue(todo);
    const injected = deps();

    await createApiWorkflows(injected).todo.createTodo(scope, { title: "  Buy milk  " });

    expect(todosAdapter.createTodo).toHaveBeenCalledWith(scope, {
      description: null,
      noteId: null,
      title: "Buy milk"
    });
    expect(injected.publish).toHaveBeenCalledTimes(1);
    expect(injected.publish).toHaveBeenCalledWith("todo:created", todo);
  });

  it("warns without failing the delete when attachment cleanup throws", async () => {
    vi.mocked(storageAdapter.deleteFilesByEntity).mockRejectedValue(new Error("s3 unreachable"));
    vi.mocked(todosAdapter.deleteTodo).mockResolvedValue(true);

    await expect(createApiWorkflows(deps()).todo.deleteTodo(scope, todo.id)).resolves.toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    const [payload] = warn.mock.calls[0] ?? [];
    // Under an `error` key with a bounded field set, never `err` — pino's
    // default serializer would copy the whole error onto the record.
    expect(Object.keys(payload as Record<string, unknown>).sort()).toEqual(["error", "todoId"]);
  });
});
