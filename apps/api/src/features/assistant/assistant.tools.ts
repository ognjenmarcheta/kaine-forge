import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { Notes } from "../notes/notes.module";
import type { Todos } from "../todos/todos.module";

// Model-chosen reads and writes go through the same modules the GraphQL
// resolvers use, so they get attachment cleanup on delete and title
// normalization on create and update. Calling todos.adapter directly here is
// what made a model-initiated delete orphan its attachment rows (issue #393).
export interface AssistantToolDeps {
  notes: Pick<Notes, "create" | "list" | "update">;
  todos: Pick<Todos, "create" | "delete" | "list" | "toggle" | "update">;
}

// Trimmed before length is checked, so "   " is rejected at the tool boundary
// rather than reaching the workflow. The workflow's ensureTodoTitle is still the
// guarantee; this only gives the model a faster, clearer failure.
const todoTitleSchema = z.string().trim().min(1).max(255);
const noteTitleSchema = z.string().trim().min(1).max(255);

export function createAssistantTools({ notes, todos }: AssistantToolDeps): ToolSet {
  return {
    createTodo: tool({
      description: "Create a new todo for the user.",
      inputSchema: z.object({
        title: todoTitleSchema,
        description: z.string().nullable()
      }),
      execute: async ({ title, description }) => {
        const todo = await todos.create({ title, description });
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    listTodos: tool({
      description: "List the user's todos. Use this to find the id of a todo before updating it.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20)
      }),
      execute: async ({ limit }) => {
        const listed = await todos.list({ first: limit });
        return listed.items.map((todo) => ({
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
        const todo = await todos.toggle(id);
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    updateTodo: tool({
      description: "Update a todo's title and/or description by id.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: todoTitleSchema.optional(),
        description: z.string().nullable().optional()
      }),
      execute: async ({ id, title, description }) => {
        const todo = await todos.update(id, {
          ...(title === undefined ? {} : { title }),
          ...(description === undefined ? {} : { description })
        });
        return { id: todo.id, title: todo.title, completed: todo.completed };
      }
    }),
    deleteTodo: tool({
      description: "Delete a todo by id.",
      inputSchema: z.object({ id: z.string().uuid() }),
      execute: async ({ id }) => {
        const deleted = await todos.delete(id);
        return { id, deleted };
      }
    }),
    createNote: tool({
      description: "Create a note with an optional body and an optional checklist of todos.",
      inputSchema: z.object({
        title: noteTitleSchema,
        body: z.string().nullable().optional(),
        todoTitles: z.array(todoTitleSchema).optional()
      }),
      execute: async ({ title, body, todoTitles }) => {
        const note = await notes.create({ title, body: body ?? null });
        const created: { id: string; title: string }[] = [];

        for (const todoTitle of todoTitles ?? []) {
          const todo = await todos.create({
            title: todoTitle,
            description: null,
            noteId: note.id
          });
          created.push({ id: todo.id, title: todo.title });
        }

        return { id: note.id, title: note.title, todos: created };
      }
    }),
    listNotes: tool({
      description: "List the user's notes to find a note id.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ limit }) => {
        const listed = await notes.list({ first: limit });
        return listed.items.map((note) => ({ id: note.id, title: note.title }));
      }
    }),
    updateNote: tool({
      description: "Update a note's title and/or body by id.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: noteTitleSchema.optional(),
        body: z.string().nullable().optional()
      }),
      execute: async ({ id, title, body }) => {
        const note = await notes.update(id, {
          ...(title === undefined ? {} : { title }),
          ...(body === undefined ? {} : { body })
        });
        return { id: note.id, title: note.title };
      }
    }),
    addTodoToNote: tool({
      description: "Add a todo to an existing note by note id.",
      inputSchema: z.object({ noteId: z.string().uuid(), title: todoTitleSchema }),
      execute: async ({ noteId, title }) => {
        const todo = await todos.create({ title, description: null, noteId });
        return { id: todo.id, title: todo.title, noteId };
      }
    })
  };
}
