import { pipe } from "graphql-yoga";

import {
  createTodo,
  deleteTodo,
  getTodoById,
  listTodosByScope,
  toggleTodo,
  updateTodo
} from "./todos.adapter";
import { createTodoAiWorkflow, type GenerateTodosInput } from "./todos.ai";
import { createTodoAiRuntime } from "./todos.ai-runtime";
import { TODOS_CONFIG } from "./todos.config";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.type";
import { coercePagination } from "./todos.util";
import { createTodoWorkflow } from "./todos.workflow";
import type { ApiContext } from "../../context";
import { errorReporter, formatLoggableError } from "../../observability";
import { filterByOrganization } from "../../pubsub";
import { createAttachmentLifecycle } from "../storage/attachment.lifecycle";
import { deleteFilesByEntity, listFiles } from "../storage/storage.adapter";

type TodosQueryArgs = { limit?: number; offset?: number };
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type GenerateTodosArgs = { input: GenerateTodosInput };
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

function createTodoAiWorkflowForContext(ctx: ResolverContext) {
  const aiRuntime = createTodoAiRuntime();

  return createTodoAiWorkflow({
    createTodo,
    generateTodoDrafts: aiRuntime.generateTodoDrafts,
    isConfigured: aiRuntime.isConfigured,
    maxGeneratedTodos: aiRuntime.maxGeneratedTodos,
    publishTodoEvent: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    },
    reportGenerationFailure: ({ err }) => {
      // `error`, not `err`: see observability.ts — the AI SDK's error carries
      // the outgoing request body.
      ctx.logger.error({ error: formatLoggableError(err) }, "todo generation failed");
      errorReporter.captureException(err, { feature: "todos-ai" });
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
      ctx.requireOrganizationScope();
      return ctx.loaders.todoAttachments.load(parent.id);
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
      return createTodoWorkflowForContext(ctx).createTodo(scope, args.input);
    },
    async generateTodos(_parent: unknown, args: GenerateTodosArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoAiWorkflowForContext(ctx).generateTodos(scope, args.input);
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoWorkflowForContext(ctx).updateTodo(scope, args.id, args.input);
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
