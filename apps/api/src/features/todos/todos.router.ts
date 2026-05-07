import { pipe } from "graphql-yoga";

import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByScope,
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
import { createTodoWorkflow } from "./todos.workflow";
import type { ApiContext } from "../../context";
import { filterByOrganization } from "../../pubsub";
import { deleteFilesByEntity, listFiles } from "../storage/storage.adapter";

type TodosQueryArgs = { limit?: number; offset?: number };
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type UpdateTodoArgs = { id: string; input: UpdateTodoInput };
type ResolverContext = ApiContext;

function createTodoWorkflowForContext(ctx: ResolverContext) {
  return createTodoWorkflow({
    deleteTodo,
    deleteTodoAttachments: async (scope, id) => {
      try {
        await deleteFilesByEntity(scope, "todo", id);
      } catch (err) {
        ctx.logger.warn({ err, todoId: id }, "failed to soft-delete todo attachments");
      }
    }
  });
}

export const todosResolvers = {
  Todo: {
    async attachments(
      parent: { id: string; organizationId: string },
      _args: unknown,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();

      try {
        return await listFiles(scope, {
          entityType: "todo",
          entityId: parent.id,
          status: "uploaded"
        });
      } catch {
        return [];
      }
    }
  },
  Query: {
    async todos(_parent: unknown, args: TodosQueryArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const pagination = coercePagination(args, TODOS_CONFIG.pagination);

      return listTodosByScope(scope, pagination);
    },
    async todo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return getTodoById(scope, args.id);
    }
  },
  Mutation: {
    async createTodo(_parent: unknown, args: CreateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const input = args.input as CreateTodoInput;

      const result = await createTodo(scope, {
        title: ensureTodoTitle(input.title),
        description: parseOptionalDescription(input.description ?? null)
      });

      ctx.pubsub.publish("todo:created", result);
      return result;
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const input = args.input as UpdateTodoInput;

      const result = await updateTodo(
        scope,
        args.id,
        applyTodoPatch(input as UpdateTodoInput & Record<string, unknown>)
      );

      ctx.pubsub.publish("todo:updated", result);
      return result;
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const result = await createTodoWorkflowForContext(ctx).deleteTodo(scope, args.id);

      if (result) {
        ctx.pubsub.publish("todo:deleted", {
          id: args.id,
          organizationId: scope.organizationId
        });
      }

      return result;
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      const result = await toggleTodo(scope, args.id);

      ctx.pubsub.publish("todo:toggled", result);
      return result;
    }
  },
  Subscription: {
    todoCreated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("todo:created"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoUpdated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("todo:updated"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoDeleted: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("todo:deleted"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    todoToggled: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(ctx.pubsub.subscribe("todo:toggled"), filterByOrganization(organizationId));
      },
      resolve(payload: unknown) {
        return payload;
      }
    }
  }
};
