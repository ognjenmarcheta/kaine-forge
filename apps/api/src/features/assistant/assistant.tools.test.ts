import type { ToolExecutionOptions, ToolSet } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAssistantTools, type AssistantToolDeps } from "./assistant.tools";
import * as notesAdapter from "../notes/notes.adapter";
import * as todosAdapter from "../todos/todos.adapter";
import { createTodoWorkflow } from "../todos/todos.workflow";

// Reads only. The absence of the write functions here is itself the assertion
// that the tools module no longer imports them (issue #393) — if it did, these
// tests would fail with "is not a function" rather than passing.
vi.mock("../notes/notes.adapter", () => ({ listNotesByScope: vi.fn() }));
vi.mock("../todos/todos.adapter", () => ({ listTodosByScope: vi.fn() }));

const scope = {
  organizationId: "org-1",
  user: { email: "user@example.com", emailVerified: false, id: "user-1", name: "User" },
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

function createDeps(overrides: Partial<AssistantToolDeps> = {}): AssistantToolDeps {
  return {
    noteWorkflow: {
      createNote: vi.fn(async () => note),
      updateNote: vi.fn(async () => note)
    },
    scope,
    todoWorkflow: {
      createTodo: vi.fn(async () => todo),
      deleteTodo: vi.fn(async () => true),
      toggleTodo: vi.fn(async () => todo),
      updateTodo: vi.fn(async () => todo)
    },
    ...overrides
  };
}

describe("createAssistantTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes every write through the workflow, never the adapter", async () => {
    const deps = createDeps();
    const tools = createAssistantTools(deps);

    await runTool(tools, "createTodo", { title: "Buy milk", description: "details" });
    await runTool(tools, "completeTodo", { id: todo.id });
    await runTool(tools, "updateTodo", { id: todo.id, title: "Edited" });
    await runTool(tools, "deleteTodo", { id: todo.id });

    expect(deps.todoWorkflow.createTodo).toHaveBeenCalledWith(scope, {
      title: "Buy milk",
      description: "details"
    });
    expect(deps.todoWorkflow.toggleTodo).toHaveBeenCalledWith(scope, todo.id);
    expect(deps.todoWorkflow.updateTodo).toHaveBeenCalledWith(scope, todo.id, {
      title: "Edited"
    });
    expect(deps.todoWorkflow.deleteTodo).toHaveBeenCalledWith(scope, todo.id);
  });

  it("deleteTodo reaches the workflow, which is what cleans attachments first", async () => {
    // The attachment-cleanup-before-delete ordering itself is proven by
    // todos.workflow.test.ts. What was broken here was never reaching it: the
    // tool called todos.adapter.deleteTodo directly, so a model-initiated delete
    // orphaned its file rows while the GraphQL mutation did not.
    const deps = createDeps();
    const result = await runTool(createAssistantTools(deps), "deleteTodo", { id: todo.id });

    expect(deps.todoWorkflow.deleteTodo).toHaveBeenCalledWith(scope, todo.id);
    expect(result).toEqual({ id: todo.id, deleted: true });
  });

  it("cleans attachments before deleting, through the real workflow", async () => {
    // The whole of #393 in one assertion: the real createTodoWorkflow wired into
    // the tool, proving a model-initiated delete reaches deleteTodoAttachments
    // before the row goes. Previously the tool called todos.adapter.deleteTodo
    // directly and the file rows were orphaned at status = 'uploaded'.
    const order: string[] = [];
    const realWorkflow = createTodoWorkflow({
      createTodo: vi.fn(async () => todo),
      deleteTodo: vi.fn(async () => {
        order.push("deleteTodo");
        return true;
      }),
      deleteTodoAttachments: vi.fn(async () => {
        order.push("deleteTodoAttachments");
      }),
      publishTodoEvent: vi.fn(),
      toggleTodo: vi.fn(async () => todo),
      updateTodo: vi.fn(async () => todo),
      warnTodoAttachmentCleanupFailed: vi.fn()
    });
    const tools = createAssistantTools(createDeps({ todoWorkflow: realWorkflow }));

    await runTool(tools, "deleteTodo", { id: todo.id });

    expect(order).toEqual(["deleteTodoAttachments", "deleteTodo"]);
  });

  it("reports deleted: false without throwing when nothing was removed", async () => {
    const deps = createDeps({
      todoWorkflow: { ...createDeps().todoWorkflow, deleteTodo: vi.fn(async () => false) }
    });

    await expect(
      runTool(createAssistantTools(deps), "deleteTodo", { id: todo.id })
    ).resolves.toEqual({ id: todo.id, deleted: false });
  });

  it("rejects a whitespace-only title at the tool boundary", async () => {
    // The tool schema trims before checking length, so "   " never reaches the
    // workflow. Before the fix this was z.string().min(1), and "   " is length 3.
    const tools = createAssistantTools(createDeps());
    const createTodo = tools["createTodo"];

    expect(createTodo?.inputSchema).toBeDefined();
    const parsed = (
      createTodo?.inputSchema as { safeParse: (v: unknown) => { success: boolean } }
    ).safeParse({ title: "   ", description: null });
    expect(parsed.success).toBe(false);
  });

  it("rejects a whitespace-only title at the workflow too, not only the schema", async () => {
    // Belt and braces: a real createTodoWorkflow over a stub adapter, so
    // ensureTodoTitle actually runs. The schema is the fast failure; this is the
    // guarantee.
    const adapterCreate = vi.fn(async () => todo);
    const realWorkflow = createTodoWorkflow({
      createTodo: adapterCreate,
      deleteTodo: vi.fn(async () => true),
      deleteTodoAttachments: vi.fn(async () => undefined),
      publishTodoEvent: vi.fn(),
      toggleTodo: vi.fn(async () => todo),
      updateTodo: vi.fn(async () => todo),
      warnTodoAttachmentCleanupFailed: vi.fn()
    });

    await expect(realWorkflow.createTodo(scope, { title: "   " })).rejects.toThrow(
      "todo title is required"
    );
    expect(adapterCreate).not.toHaveBeenCalled();
  });

  it("normalizes an update through the workflow's patch builder", async () => {
    const adapterUpdate = vi.fn(async () => todo);
    const realWorkflow = createTodoWorkflow({
      createTodo: vi.fn(async () => todo),
      deleteTodo: vi.fn(async () => true),
      deleteTodoAttachments: vi.fn(async () => undefined),
      publishTodoEvent: vi.fn(),
      toggleTodo: vi.fn(async () => todo),
      updateTodo: adapterUpdate,
      warnTodoAttachmentCleanupFailed: vi.fn()
    });
    const tools = createAssistantTools(createDeps({ todoWorkflow: realWorkflow }));

    await runTool(tools, "updateTodo", { id: todo.id, title: "  Edited  ", description: "   " });

    // applyTodoPatch trimmed the title and normalized the blank description to
    // null — neither happened when the tool called the adapter directly.
    expect(adapterUpdate).toHaveBeenCalledWith(scope, todo.id, {
      description: null,
      title: "Edited"
    });
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
    expect(deps.todoWorkflow.createTodo).toHaveBeenCalledTimes(2);
    expect(deps.todoWorkflow.createTodo).toHaveBeenNthCalledWith(1, scope, {
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

  it("addTodoToNote links through the workflow", async () => {
    const deps = createDeps();
    const result = await runTool(createAssistantTools(deps), "addTodoToNote", {
      noteId: note.id,
      title: todo.title
    });

    expect(deps.todoWorkflow.createTodo).toHaveBeenCalledWith(scope, {
      title: todo.title,
      description: null,
      noteId: note.id
    });
    expect(result).toEqual({ id: todo.id, title: todo.title, noteId: note.id });
  });

  it("keeps reads on the adapters", async () => {
    vi.mocked(todosAdapter.listTodosByScope).mockResolvedValue([todo]);
    vi.mocked(notesAdapter.listNotesByScope).mockResolvedValue([note]);
    const tools = createAssistantTools(createDeps());

    await runTool(tools, "listTodos", { limit: 5 });
    await runTool(tools, "listNotes", { limit: 5 });

    expect(todosAdapter.listTodosByScope).toHaveBeenCalledWith(scope, { limit: 5, offset: 0 });
    expect(notesAdapter.listNotesByScope).toHaveBeenCalledWith(scope, { limit: 5, offset: 0 });
  });
});
