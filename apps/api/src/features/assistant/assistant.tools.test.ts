import type { ToolExecutionOptions, ToolSet } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAssistantTools } from "./assistant.tools";
import * as notesAdapter from "../notes/notes.adapter";
import * as todosAdapter from "../todos/todos.adapter";

vi.mock("../notes/notes.adapter", () => ({
  createNote: vi.fn(),
  listNotesByScope: vi.fn(),
  updateNote: vi.fn()
}));

vi.mock("../todos/todos.adapter", () => ({
  createTodo: vi.fn(),
  deleteTodo: vi.fn(),
  listTodosByScope: vi.fn(),
  toggleTodo: vi.fn(),
  updateTodo: vi.fn()
}));

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

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

describe("createAssistantTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTodo calls the scoped adapter and publishes todo:created", async () => {
    vi.mocked(todosAdapter.createTodo).mockResolvedValue(todo);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    const result = await runTool(tools, "createTodo", {
      title: "Buy milk",
      description: "details"
    });

    expect(todosAdapter.createTodo).toHaveBeenCalledWith(scope, {
      title: "Buy milk",
      description: "details"
    });
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:created", todo);
    expect(result).toEqual({ id: todo.id, title: todo.title, completed: false });
  });

  it("completeTodo toggles via the scoped adapter and publishes todo:toggled", async () => {
    const toggled = { ...todo, completed: true };
    vi.mocked(todosAdapter.toggleTodo).mockResolvedValue(toggled);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    const result = await runTool(tools, "completeTodo", { id: todo.id });

    expect(todosAdapter.toggleTodo).toHaveBeenCalledWith(scope, todo.id);
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:toggled", toggled);
    expect(result).toEqual({ id: todo.id, title: todo.title, completed: true });
  });

  it("deleteTodo publishes todo:deleted only when a row was removed", async () => {
    vi.mocked(todosAdapter.deleteTodo).mockResolvedValue(true);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    const result = await runTool(tools, "deleteTodo", { id: todo.id });

    expect(todosAdapter.deleteTodo).toHaveBeenCalledWith(scope, todo.id);
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:deleted", {
      id: todo.id,
      organizationId: scope.organizationId
    });
    expect(result).toEqual({ id: todo.id, deleted: true });
  });

  it("deleteTodo does not publish when nothing was removed", async () => {
    vi.mocked(todosAdapter.deleteTodo).mockResolvedValue(false);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    await runTool(tools, "deleteTodo", { id: todo.id });

    expect(publishTodoEvent).not.toHaveBeenCalled();
  });

  it("createNote creates a note and its checklist todos, publishing both events", async () => {
    vi.mocked(notesAdapter.createNote).mockResolvedValue(note);
    vi.mocked(todosAdapter.createTodo).mockResolvedValue(todo);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    const result = await runTool(tools, "createNote", {
      title: note.title,
      body: null,
      todoTitles: ["a", "b"]
    });

    expect(notesAdapter.createNote).toHaveBeenCalledWith(scope, { title: note.title, body: null });
    expect(publishNoteEvent).toHaveBeenCalledWith("note:created", note);
    expect(todosAdapter.createTodo).toHaveBeenCalledTimes(2);
    expect(todosAdapter.createTodo).toHaveBeenNthCalledWith(1, scope, {
      title: "a",
      description: null,
      noteId: note.id
    });
    expect(todosAdapter.createTodo).toHaveBeenNthCalledWith(2, scope, {
      title: "b",
      description: null,
      noteId: note.id
    });
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:created", todo);
    expect(publishTodoEvent).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: note.id,
      title: note.title,
      todos: [
        { id: todo.id, title: todo.title },
        { id: todo.id, title: todo.title }
      ]
    });
  });

  it("addTodoToNote creates a todo linked to the note and publishes todo:created", async () => {
    const linkedTodo = { ...todo, noteId: note.id };
    vi.mocked(todosAdapter.createTodo).mockResolvedValue(linkedTodo);
    const publishTodoEvent = vi.fn();
    const publishNoteEvent = vi.fn();
    const tools = createAssistantTools({ publishNoteEvent, publishTodoEvent, scope });

    const result = await runTool(tools, "addTodoToNote", {
      noteId: note.id,
      title: linkedTodo.title
    });

    expect(todosAdapter.createTodo).toHaveBeenCalledWith(scope, {
      title: linkedTodo.title,
      description: null,
      noteId: note.id
    });
    expect(publishTodoEvent).toHaveBeenCalledWith("todo:created", linkedTodo);
    expect(result).toEqual({ id: linkedTodo.id, title: linkedTodo.title, noteId: note.id });
  });
});
