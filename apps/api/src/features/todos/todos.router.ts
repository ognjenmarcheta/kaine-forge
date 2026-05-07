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
import { coercePagination } from "./todos.util";
import { createTodoWorkflow } from "./todos.workflow";
import type { ApiContext } from "../../context";
import { filterByOrganization } from "../../pubsub";
import { createAttachmentLifecycle } from "../storage/attachment.lifecycle";
import { deleteFilesByEntity, listFiles } from "../storage/storage.adapter";

type TodosQueryArgs = { limit?: number; offset?: number };
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type UpdateTodoArgs = { id: string; input: UpdateTodoInput };
type ResolverContext = ApiContext;

function createTodoWorkflowForContext(ctx: ResolverContext) {
  const attachmentLifecycle = createAttachmentLifecycle({
    deleteFilesByEntity,
    listFiles
  });

  return createTodoWorkflow({
    createTodo,
    deleteTodo,
    deleteTodoAttachments: async (scope, id) => {
      await attachmentLifecycle.deleteTodoAttachments(scope, id);
    },
    publishTodoEvent: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    },
    toggleTodo,
    updateTodo,
    warnTodoAttachmentCleanupFailed: ({ err, todoId }) => {
      ctx.logger.warn({ err, todoId }, "failed to soft-delete todo attachments");
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
      const attachmentLifecycle = createAttachmentLifecycle({
        deleteFilesByEntity,
        listFiles
      });

      try {
        return await attachmentLifecycle.listTodoAttachments(scope, parent.id);
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
      return createTodoWorkflowForContext(ctx).createTodo(scope, args.input as CreateTodoInput);
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoWorkflowForContext(ctx).updateTodo(
        scope,
        args.id,
        args.input as UpdateTodoInput
      );
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoWorkflowForContext(ctx).deleteTodo(scope, args.id);
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoWorkflowForContext(ctx).toggleTodo(scope, args.id);
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
