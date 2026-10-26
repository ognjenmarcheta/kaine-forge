import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it, vi } from "vitest";

import { createScopedData } from "./context.data";
import { createApiLoaders } from "./context.loaders";

// These unit tests inject their adapters. Do not initialize the production DB
// through the default adapters when the test module is imported.
vi.mock("./features/storage/storage.adapter", () => ({ listFilesByEntityIds: vi.fn() }));
vi.mock("./features/todos/todos.adapter", () => ({ listTodosByNoteIds: vi.fn() }));

describe("context.loaders", () => {
  const scope = {
    membership: { id: "membership-1", role: "owner", userId: "user-1" },
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      twoFactorEnabled: false,
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };
  // Opaque here: the injected adapters never query it.
  const data = createScopedData({ db: drizzle.mock(), requireOrganizationScope: () => scope });

  it("noteTodos batches all requested notes into one adapter call", async () => {
    const todoA = { id: "todo-1", noteId: "note-1" };
    const todoB = { id: "todo-2", noteId: "note-2" };
    const todoC = { id: "todo-3", noteId: "note-1" };
    const listTodosByNoteIds = vi.fn().mockResolvedValue([todoA, todoB, todoC]);
    const listFilesByEntityIds = vi.fn();
    const loaders = createApiLoaders(data, {
      listFilesByEntityIds,
      listTodosByNoteIds
    } as never);

    const [note1Todos, note2Todos, note3Todos] = await Promise.all([
      loaders.noteTodos.load("note-1"),
      loaders.noteTodos.load("note-2"),
      loaders.noteTodos.load("note-3")
    ]);

    expect(listTodosByNoteIds).toHaveBeenCalledTimes(1);
    expect(listTodosByNoteIds).toHaveBeenCalledWith(data, ["note-1", "note-2", "note-3"]);
    expect(note1Todos).toEqual([todoA, todoC]);
    expect(note2Todos).toEqual([todoB]);
    expect(note3Todos).toEqual([]);
  });

  it("todoAttachments batches all requested todos into one org-scoped adapter call", async () => {
    const fileA = { id: "file-1", entityId: "todo-1" };
    const fileB = { id: "file-2", entityId: "todo-2" };
    const listFilesByEntityIds = vi.fn().mockResolvedValue([fileA, fileB]);
    const listTodosByNoteIds = vi.fn();
    const loaders = createApiLoaders(data, {
      listFilesByEntityIds,
      listTodosByNoteIds
    } as never);

    const [todo1Files, todo2Files, todo3Files] = await Promise.all([
      loaders.todoAttachments.load("todo-1"),
      loaders.todoAttachments.load("todo-2"),
      loaders.todoAttachments.load("todo-3")
    ]);

    expect(listFilesByEntityIds).toHaveBeenCalledTimes(1);
    expect(listFilesByEntityIds).toHaveBeenCalledWith(
      data,
      "todo",
      ["todo-1", "todo-2", "todo-3"],
      "uploaded"
    );
    expect(todo1Files).toEqual([fileA]);
    expect(todo2Files).toEqual([fileB]);
    expect(todo3Files).toEqual([]);
  });
});
