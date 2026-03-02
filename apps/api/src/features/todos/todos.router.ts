import { filter, pipe } from "graphql-yoga";

import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByUserIdAndOrganizationId,
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
import { requireActiveOrganizationId, requireUser } from "../../middleware/auth.middleware";

type TodosQueryArgs = { limit?: number; offset?: number };
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type UpdateTodoArgs = { id: string; input: UpdateTodoInput };
type ResolverContext = ApiContext;

export const todosResolvers = {
  Query: {
    async todos(_parent: unknown, args: TodosQueryArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      const pagination = coercePagination(args, TODOS_CONFIG.pagination);

      return listTodosByUserIdAndOrganizationId(user.id, activeOrganizationId, pagination);
    },
    async todo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      return getTodoById(user.id, activeOrganizationId, args.id);
    }
  },
  Mutation: {
    async createTodo(_parent: unknown, args: CreateTodoArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      const input = args.input as CreateTodoInput;

      const result = await createTodo(user.id, activeOrganizationId, {
        title: ensureTodoTitle(input.title),
        description: parseOptionalDescription(input.description ?? null)
      });

      ctx.pubsub.publish("todo:created", result);
      return result;
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      const input = args.input as UpdateTodoInput;

      const result = await updateTodo(
        user.id,
        activeOrganizationId,
        args.id,
        applyTodoPatch(input as UpdateTodoInput & Record<string, unknown>)
      );

      ctx.pubsub.publish("todo:updated", result);
      return result;
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      const result = await deleteTodo(user.id, activeOrganizationId, args.id);

      if (result) {
        ctx.pubsub.publish("todo:deleted", {
          id: args.id,
          organizationId: activeOrganizationId
        });
      }

      return result;
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const user = requireUser(ctx);
      const activeOrganizationId = requireActiveOrganizationId(ctx);
      const result = await toggleTodo(user.id, activeOrganizationId, args.id);

      ctx.pubsub.publish("todo:toggled", result);
      return result;
    }
  },
  Subscription: {
    todoCreated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const organizationId = requireActiveOrganizationId(ctx);
        return pipe(
          ctx.pubsub.subscribe("todo:created"),
          filter((payload) => payload.organizationId === organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoUpdated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const organizationId = requireActiveOrganizationId(ctx);
        return pipe(
          ctx.pubsub.subscribe("todo:updated"),
          filter((payload) => payload.organizationId === organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoDeleted: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const organizationId = requireActiveOrganizationId(ctx);
        return pipe(
          ctx.pubsub.subscribe("todo:deleted"),
          filter((payload) => payload.organizationId === organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoToggled: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const organizationId = requireActiveOrganizationId(ctx);
        return pipe(
          ctx.pubsub.subscribe("todo:toggled"),
          filter((payload) => payload.organizationId === organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    }
  }
};
