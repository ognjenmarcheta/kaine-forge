import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { PubSubEventMap } from "../../pubsub";
import {
  createNote as createNoteRow,
  listNotesByScope,
  updateNote as updateNoteRow
} from "../notes/notes.adapter";
import type { NotePatch } from "../notes/notes.type";
import {
  createTodo,
  deleteTodo,
  listTodosByScope,
  toggleTodo,
  updateTodo
} from "../todos/todos.adapter";
import type { TodoPatch } from "../todos/todos.type";

export interface AssistantToolDeps {
  publishNoteEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  publishTodoEvent: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  scope: AuthenticatedOrganizationScope;
}

export function createAssistantTools({
  publishNoteEvent,
  publishTodoEvent,
  scope
}: AssistantToolDeps): ToolSet {
  return {
    createTodo: tool({
      description: "Create a new todo for the user.",
      inputSchema: z.object({
        title: z.string().min(1).max(255),
        description: z.string().nullable()
      }),
      execute: async ({ title, description }) => {
        const todo = await createTodo(scope, { title, description });
        publishTodoEvent("todo:created", todo);
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    listTodos: tool({
      description: "List the user's todos. Use this to find the id of a todo before updating it.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20)
      }),
      execute: async ({ limit }) => {
        const todos = await listTodosByScope(scope, { limit, offset: 0 });
        return todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          completed: todo.completed
        }));
      }
    }),
    completeTodo: tool({
      description: "Toggle a todo's completion state by id.",
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async ({ id }) => {
        const todo = await toggleTodo(scope, id);
        publishTodoEvent("todo:toggled", todo);
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    updateTodo: tool({
      description: "Update a todo's title and/or description by id.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional()
      }),
      execute: async ({ id, title, description }) => {
        const patch: TodoPatch = {};

        if (title !== undefined) {
          patch.title = title;
        }

        if (description !== undefined) {
          patch.description = description;
        }

        const todo = await updateTodo(scope, id, patch);
        publishTodoEvent("todo:updated", todo);
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    deleteTodo: tool({
      description: "Delete a todo by id.",
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async ({ id }) => {
        const deleted = await deleteTodo(scope, id);

        if (deleted) {
          publishTodoEvent("todo:deleted", { id, organizationId: scope.organizationId });
        }

        return { id, deleted };
      }
    }),
    createNote: tool({
      description: "Create a note with an optional body and an optional checklist of todos.",
      inputSchema: z.object({
        title: z.string().min(1).max(255),
        body: z.string().nullable().optional(),
        todoTitles: z.array(z.string().min(1).max(255)).optional()
      }),
      execute: async ({ title, body, todoTitles }) => {
        const note = await createNoteRow(scope, { title, body: body ?? null });
        publishNoteEvent("note:created", note);
        const created: { id: string; title: string }[] = [];
        for (const todoTitle of todoTitles ?? []) {
          const todo = await createTodo(scope, {
            title: todoTitle,
            description: null,
            noteId: note.id
          });
          publishTodoEvent("todo:created", todo);
          created.push({ id: todo.id, title: todo.title });
        }
        return { id: note.id, title: note.title, todos: created };
      }
    }),
    listNotes: tool({
      description: "List the user's notes to find a note id.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ limit }) => {
        const notes = await listNotesByScope(scope, { limit, offset: 0 });
        return notes.map((note) => ({ id: note.id, title: note.title }));
      }
    }),
    updateNote: tool({
      description: "Update a note's title and/or body by id.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        body: z.string().nullable().optional()
      }),
      execute: async ({ id, title, body }) => {
        const patch: NotePatch = {};
        if (title !== undefined) patch.title = title;
        if (body !== undefined) patch.body = body;
        const note = await updateNoteRow(scope, id, patch);
        publishNoteEvent("note:updated", note);
        return { id: note.id, title: note.title };
      }
    }),
    addTodoToNote: tool({
      description: "Add a todo to an existing note by note id.",
      inputSchema: z.object({ noteId: z.string().uuid(), title: z.string().min(1).max(255) }),
      execute: async ({ noteId, title }) => {
        const todo = await createTodo(scope, { title, description: null, noteId });
        publishTodoEvent("todo:created", todo);
        return { id: todo.id, title: todo.title, noteId };
      }
    })
  };
}
