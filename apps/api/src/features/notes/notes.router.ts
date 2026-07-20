import { pipe } from "graphql-yoga";

import { createNote, deleteNote, getNoteById, listNotesByScope, updateNote } from "./notes.adapter";
import type { CreateNoteInput, UpdateNoteInput } from "./notes.type";
import { coercePagination } from "./notes.util";
import { createNoteWorkflow } from "./notes.workflow";
import type { ApiContext } from "../../context";
import { filterByOrganization } from "../../pubsub";
import { createTodo } from "../todos/todos.adapter";
import type { CreateTodoInput } from "../todos/todos.type";

type ResolverContext = ApiContext;
type NotesQueryArgs = { limit?: number; offset?: number };
type NoteByIdArgs = { id: string };
type CreateNoteArgs = { input: CreateNoteInput };
type UpdateNoteArgs = { id: string; input: UpdateNoteInput };
type AddTodoToNoteArgs = { noteId: string; input: CreateTodoInput };

function createNoteWorkflowForContext(ctx: ResolverContext) {
  return createNoteWorkflow({
    createNote,
    deleteNote,
    publishNoteEvent: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    },
    updateNote
  });
}

export const notesResolvers = {
  Note: {
    async todos(parent: { id: string }, _args: unknown, ctx: ResolverContext) {
      ctx.requireOrganizationScope();
      return ctx.loaders.noteTodos.load(parent.id);
    }
  },
  Query: {
    async notes(_parent: unknown, args: NotesQueryArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return listNotesByScope(scope, coercePagination(args));
    },
    async note(_parent: unknown, args: NoteByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return getNoteById(scope, args.id);
    }
  },
  Mutation: {
    async createNote(_parent: unknown, args: CreateNoteArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createNoteWorkflowForContext(ctx).createNote(scope, args.input);
    },
    async updateNote(_parent: unknown, args: UpdateNoteArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createNoteWorkflowForContext(ctx).updateNote(scope, args.id, args.input);
    },
    async deleteNote(_parent: unknown, args: NoteByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createNoteWorkflowForContext(ctx).deleteNote(scope, args.id);
    },
    async addTodoToNote(_parent: unknown, args: AddTodoToNoteArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const todo = await createTodo(scope, {
        title: args.input.title,
        description: args.input.description ?? null,
        noteId: args.noteId
      });
      ctx.pubsub.publish("todo:created", todo);
      return todo;
    }
  },
  Subscription: {
    noteCreated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("note:created"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    noteUpdated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("note:updated"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    noteDeleted: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("note:deleted"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    }
  }
};
