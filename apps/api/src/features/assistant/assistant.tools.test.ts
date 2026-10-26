import type { ToolExecutionOptions, ToolSet } from "ai";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAssistantTools, type AssistantToolDeps } from "./assistant.tools";
import { createScopedData } from "../../context.data";
import * as notesAdapter from "../notes/notes.adapter";

// Reads only. The absence of the write functions here is itself the assertion
// that the tools module no longer imports them (issue #393) — if it did, these
// tests would fail with "is not a function" rather than passing.
vi.mock("../notes/notes.adapter", () => ({ listNotesByScope: vi.fn() }));

const scope = {
  membership: { id: "membership-1", role: "owner", userId: "user-1" },
  organizationId: "org-1",
  user: { email: "user@example.com", emailVerified: false, id: "user-1", name: "User" },
  userId: "user-1"
};
// Opaque here: the mocked adapters never query it.
const data = createScopedData({ db: drizzle.mock(), requireOrganizationScope: () => scope });

const todo = {
  completed: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  description: "details",
  id: "11111111-1111-1111-1111-111111111111",
  noteId: null,
  organizationId: "org-1",
  title: "Buy milk",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1"
};

const note = {
  body: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  id: "22222222-2222-2222-2222-222222222222",
  organizationId: "org-1",
  title: "N",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  userId: "user-1"
};

const toolOptions: ToolExecutionOptions<unknown> = {
  context: undefined,
  messages: [],
  toolCallId: "call-1"
};

async function runTool(tools: ToolSet, name: string, input: unknown): Promise<unknown> {
  const tool = tools[name];

  if (!tool?.execute) {
    throw new Error(`tool ${name} has no execute`);
  }

  return tool.execute(input, toolOptions);
}

function createDeps(overrides: Partial<AssistantToolDeps> = {}): AssistantToolDeps {
  return {
    data,
    noteWorkflow: {
      createNote: vi.fn(async () => note),
      updateNote: vi.fn(async () => note)
    },
    scope,
    todos: {
      create: vi.fn(async () => todo),
      delete: vi.fn(async () => true),
      list: vi.fn(async () => [todo]),
      toggle: vi.fn(async () => todo),
      update: vi.fn(async () => todo)
    },
    ...overrides
  };
}

describe("createAssistantTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes every Todo write through the Todo module", async () => {
    const deps = createDeps();
    const tools = createAssistantTools(deps);

    await runTool(tools, "createTodo", { title: "Buy milk", description: "details" });
    await runTool(tools, "completeTodo", { id: todo.id });
    await runTool(tools, "updateTodo", { id: todo.id, title: "Edited", description: "details" });
    const deleted = await runTool(tools, "deleteTodo", { id: todo.id });

    expect(deps.todos.create).toHaveBeenCalledWith({ title: "Buy milk", description: "details" });
    expect(deps.todos.toggle).toHaveBeenCalledWith(todo.id);
    expect(deps.todos.update).toHaveBeenCalledWith(todo.id, {
      description: "details",
      title: "Edited"
    });
    expect(deps.todos.delete).toHaveBeenCalledWith(todo.id);
    expect(deleted).toEqual({ id: todo.id, deleted: true });
  });

  it("reports deleted: false without throwing when nothing was removed", async () => {
    const deps = createDeps({
      todos: { ...createDeps().todos, delete: vi.fn(async () => false) }
    });

    await expect(
      runTool(createAssistantTools(deps), "deleteTodo", { id: todo.id })
    ).resolves.toEqual({ id: todo.id, deleted: false });
  });

  it("createNote creates the note and its checklist through the workflows", async () => {
    const deps = createDeps();
    const result = await runTool(createAssistantTools(deps), "createNote", {
      title: note.title,
      body: null,
      todoTitles: ["a", "b"]
    });

    expect(deps.noteWorkflow.createNote).toHaveBeenCalledWith(scope, {
      title: note.title,
      body: null
    });
    expect(deps.todos.create).toHaveBeenCalledTimes(2);
    expect(deps.todos.create).toHaveBeenNthCalledWith(1, {
      title: "a",
      description: null,
      noteId: note.id
    });
    expect(result).toEqual({
      id: note.id,
      title: note.title,
      todos: [
        { id: todo.id, title: todo.title },
        { id: todo.id, title: todo.title }
      ]
    });
  });

  it("addTodoToNote links through the Todo module", async () => {
    const deps = createDeps();
    const result = await runTool(createAssistantTools(deps), "addTodoToNote", {
      noteId: note.id,
      title: todo.title
    });

    expect(deps.todos.create).toHaveBeenCalledWith({
      title: todo.title,
      description: null,
      noteId: note.id
    });
    expect(result).toEqual({ id: todo.id, title: todo.title, noteId: note.id });
  });

  it("lists Todos through the module and Notes through the scoped adapter", async () => {
    vi.mocked(notesAdapter.listNotesByScope).mockResolvedValue([note]);
    const deps = createDeps();
    const tools = createAssistantTools(deps);

    await runTool(tools, "listTodos", { limit: 5 });
    await runTool(tools, "listNotes", { limit: 5 });

    expect(deps.todos.list).toHaveBeenCalledWith({ limit: 5, offset: 0 });
    expect(notesAdapter.listNotesByScope).toHaveBeenCalledWith(data, { limit: 5, offset: 0 });
  });
});
