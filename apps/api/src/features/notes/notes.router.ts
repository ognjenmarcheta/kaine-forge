import type { CreateNoteInput, UpdateNoteInput } from "./notes.type";
import type { ApiContext } from "../../context";
import { organizationSubscriptions } from "../../pubsub";
import type { CreateTodoInput } from "../todos/todos.type";

type ResolverContext = ApiContext;
type NotesQueryArgs = { limit?: number; offset?: number; search?: string | null };
type NoteByIdArgs = { id: string };
type CreateNoteArgs = { input: CreateNoteInput };
type UpdateNoteArgs = { id: string; input: UpdateNoteInput };
type AddTodoToNoteArgs = { noteId: string; input: CreateTodoInput };

export const notesResolvers = {
  Note: {
    async todos(parent: { id: string }, _args: unknown, ctx: ResolverContext) {
      ctx.requireOrganizationScope();
      return ctx.loaders.noteTodos.load(parent.id);
    }
  },
  Query: {
    async notes(_parent: unknown, args: NotesQueryArgs, ctx: ResolverContext) {
      return ctx.notes.list(args);
    },
    async note(_parent: unknown, args: NoteByIdArgs, ctx: ResolverContext) {
      return ctx.notes.get(args.id);
    }
  },
  Mutation: {
    async createNote(_parent: unknown, args: CreateNoteArgs, ctx: ResolverContext) {
      return ctx.notes.create(args.input);
    },
    async updateNote(_parent: unknown, args: UpdateNoteArgs, ctx: ResolverContext) {
      return ctx.notes.update(args.id, args.input);
    },
    async deleteNote(_parent: unknown, args: NoteByIdArgs, ctx: ResolverContext) {
      return ctx.notes.delete(args.id);
    },
    async addTodoToNote(_parent: unknown, args: AddTodoToNoteArgs, ctx: ResolverContext) {
      // Through the Todo module, so the title is normalized and the created
      // event is published once, in one place (issue #393).
      return ctx.todos.create({ ...args.input, noteId: args.noteId });
    }
  },
  Subscription: organizationSubscriptions(["noteCreated", "noteUpdated", "noteDeleted"])
};
