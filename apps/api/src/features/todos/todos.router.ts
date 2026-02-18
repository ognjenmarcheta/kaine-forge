import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByUserId,
  toggleTodo,
  updateTodo
} from "./todos.adapter";
import { TODOS_CONFIG } from "./todos.config";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.type";
import {
  applyTodoPatch,
  coercePagination,
  ensureTodoTitle,
  parseOptionalDescription
} from "./todos.util";
import type { ApiContext } from "../../context";
import { requireUser } from "../../middleware/auth.middleware";

type TodosQueryArgs = { limit?: number; offset?: number };
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type UpdateTodoArgs = { id: string; input: UpdateTodoInput };
type ResolverContext = ApiContext;

export const todosResolvers = {
  Query: {
    async todos(_parent: unknown, args: TodosQueryArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const pagination = coercePagination(args, TODOS_CONFIG.pagination);

      return listTodosByUserId(user.id, pagination);
    },
    async todo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      return getTodoById(user.id, args.id);
    }
  },
  Mutation: {
    async createTodo(_parent: unknown, args: CreateTodoArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const input = args.input as CreateTodoInput;

      return createTodo(user.id, {
        title: ensureTodoTitle(input.title),
        description: parseOptionalDescription(input.description ?? null)
      });
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const input = args.input as UpdateTodoInput;

      return updateTodo(
        user.id,
        args.id,
        applyTodoPatch(input as UpdateTodoInput & Record<string, unknown>)
      );
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      return deleteTodo(user.id, args.id);
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      return toggleTodo(user.id, args.id);
    }
  }
};
