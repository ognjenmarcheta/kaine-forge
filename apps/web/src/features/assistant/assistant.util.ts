import { z } from "zod";

const entity = z.object({ id: z.string().uuid(), title: z.string().min(1) });
const todo = entity.extend({ completed: z.boolean() });
const noteWithTodos = entity.extend({ todos: z.array(entity).optional() });
const deletedTodo = z.object({ id: z.string().uuid(), deleted: z.boolean() });
const noteTodo = entity.extend({ noteId: z.string().uuid() });

const toolLabels = {
  createTodo: "assistant.action.createTodo",
  listTodos: "assistant.action.listTodos",
  completeTodo: "assistant.action.completeTodo",
  updateTodo: "assistant.action.updateTodo",
  deleteTodo: "assistant.action.deleteTodo",
  createNote: "assistant.action.createNote",
  listNotes: "assistant.action.listNotes",
  updateNote: "assistant.action.updateNote",
  addTodoToNote: "assistant.action.addTodoToNote"
} as const;

interface ActionResult {
  label: string;
  kind: "read" | "change" | "unconfirmed";
  detail: string | null;
  state: string | null;
  href: string | null;
}

function labelFor(tool: string): string {
  return (
    Object.entries(toolLabels).find(([name]) => name === tool)?.[1] ?? "assistant.action.unknown"
  );
}

export function readAssistantAction(action: { tool: string; output: string | null }): ActionResult {
  const result: ActionResult = {
    label: labelFor(action.tool),
    kind: "unconfirmed",
    detail: null,
    state: null,
    href: null
  };
  if (!action.output) return result;
  let parsed: unknown;
  try {
    parsed = JSON.parse(action.output);
  } catch {
    return result;
  }
  switch (action.tool) {
    case "listTodos":
    case "listNotes": {
      const items = (action.tool === "listTodos" ? z.array(todo) : z.array(entity)).safeParse(
        parsed
      );
      return items.success
        ? { ...result, kind: "read", detail: items.data.length.toString() }
        : result;
    }
    case "createTodo":
    case "updateTodo":
    case "completeTodo": {
      const item = todo.safeParse(parsed);
      return item.success
        ? {
            ...result,
            kind: "change",
            detail: item.data.title,
            state: item.data.completed ? "assistant.result.completed" : "assistant.result.open",
            href: "/todos"
          }
        : result;
    }
    case "deleteTodo": {
      const item = deletedTodo.safeParse(parsed);
      return item.success && item.data.deleted
        ? { ...result, kind: "change", href: "/todos" }
        : result;
    }
    case "createNote":
    case "updateNote": {
      const item = (action.tool === "createNote" ? noteWithTodos : entity).safeParse(parsed);
      return item.success
        ? { ...result, kind: "change", detail: item.data.title, href: `/notes/${item.data.id}` }
        : result;
    }
    case "addTodoToNote": {
      const item = noteTodo.safeParse(parsed);
      return item.success
        ? { ...result, kind: "change", detail: item.data.title, href: `/notes/${item.data.noteId}` }
        : result;
    }
    default:
      return result;
  }
}
