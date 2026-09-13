import { pipe } from "graphql-yoga";

// createTodo here feeds createTodoAiWorkflow, which normalizes through the
// same todos.util helpers the workflow uses, so the AI path is not a guard
// bypass. Every other write goes through ctx.workflows.todo.
import { createTodo, getTodoById, listTodosByScope } from "./todos.adapter";
import { createTodoAiWorkflow, type GenerateTodosInput } from "./todos.ai";
import { createTodoAiRuntime } from "./todos.ai-runtime";
import { TODOS_CONFIG } from "./todos.config";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.type";
import { coercePagination } from "./todos.util";
import type { ApiContext } from "../../context";
import { errorReporter, formatLoggableError } from "../../observability";
import { filterByOrganization } from "../../pubsub";

type TodosQueryArgs = {
  limit?: number;
  offset?: number;
  search?: string | null;
  completed?: boolean | null;
};
type TodoByIdArgs = { id: string };
type CreateTodoArgs = { input: CreateTodoInput };
type GenerateTodosArgs = { input: GenerateTodosInput };
type UpdateTodoArgs = { id: string; input: UpdateTodoInput };
type ResolverContext = ApiContext;

function createTodoAiWorkflowForContext(ctx: ResolverContext) {
  const aiRuntime = createTodoAiRuntime({
    recordModelCall: (telemetry) => {
      ctx.logger.info(telemetry, "todo generation model call");
    }
  });

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

      return listTodosByScope(scope, pagination, args);
    },
    async todo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return getTodoById(scope, args.id);
    }
  },
  Mutation: {
    async createTodo(_parent: unknown, args: CreateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.workflows.todo.createTodo(scope, args.input);
    },
    async generateTodos(_parent: unknown, args: GenerateTodosArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return createTodoAiWorkflowForContext(ctx).generateTodos(scope, args.input);
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.workflows.todo.updateTodo(scope, args.id, args.input);
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.workflows.todo.deleteTodo(scope, args.id);
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      const scope = ctx.requireOrganizationScope();
      return ctx.workflows.todo.toggleTodo(scope, args.id);
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
