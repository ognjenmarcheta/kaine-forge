import { describe, expect, it, vi } from "vitest";

import { createApiLoaders } from "./context.loaders";

describe("context.loaders", () => {
  it("noteTodos batches all requested notes into one Todo module call", async () => {
    const todoA = { id: "todo-1", noteId: "note-1" };
    const todoB = { id: "todo-2", noteId: "note-2" };
    const todoC = { id: "todo-3", noteId: "note-1" };
    const listByNoteIds = vi.fn().mockResolvedValue([todoA, todoB, todoC]);
    const loaders = createApiLoaders({ listByNoteIds }, { listByTodoIds: vi.fn() });

    const [note1Todos, note2Todos, note3Todos] = await Promise.all([
      loaders.noteTodos.load("note-1"),
      loaders.noteTodos.load("note-2"),
      loaders.noteTodos.load("note-3")
    ]);

    expect(listByNoteIds).toHaveBeenCalledTimes(1);
    expect(listByNoteIds).toHaveBeenCalledWith(["note-1", "note-2", "note-3"]);
    expect(note1Todos).toEqual([todoA, todoC]);
    expect(note2Todos).toEqual([todoB]);
    expect(note3Todos).toEqual([]);
  });

  it("todoAttachments batches all requested todos into one Attachment module call", async () => {
    const fileA = { id: "file-1", entityId: "todo-1" };
    const fileB = { id: "file-2", entityId: "todo-2" };
    const listByTodoIds = vi.fn().mockResolvedValue([fileA, fileB]);
    const loaders = createApiLoaders({ listByNoteIds: vi.fn() }, { listByTodoIds });

    const [todo1Files, todo2Files, todo3Files] = await Promise.all([
      loaders.todoAttachments.load("todo-1"),
      loaders.todoAttachments.load("todo-2"),
      loaders.todoAttachments.load("todo-3")
    ]);

    expect(listByTodoIds).toHaveBeenCalledTimes(1);
    expect(listByTodoIds).toHaveBeenCalledWith(["todo-1", "todo-2", "todo-3"]);
    expect(todo1Files).toEqual([fileA]);
    expect(todo2Files).toEqual([fileB]);
    expect(todo3Files).toEqual([]);
  });
});
