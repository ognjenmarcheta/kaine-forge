import { createTodoAiWorkflow, type GenerateTodosInput } from "./todos.ai";
import { createTodoAiRuntime } from "./todos.ai-runtime";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.type";
import type { ApiContext } from "../../context";
import { errorReporter, formatLoggableError } from "../../observability";
import { organizationSubscriptions } from "../../pubsub";

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
    createTodo: ctx.todos.create,
    generateTodoDrafts: aiRuntime.generateTodoDrafts,
    isConfigured: aiRuntime.isConfigured,
    maxGeneratedTodos: aiRuntime.maxGeneratedTodos,
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
      return ctx.todos.list(args);
    },
    async todo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      return ctx.todos.get(args.id);
    }
  },
  Mutation: {
    async createTodo(_parent: unknown, args: CreateTodoArgs, ctx: ResolverContext) {
      return ctx.todos.create(args.input);
    },
    async generateTodos(_parent: unknown, args: GenerateTodosArgs, ctx: ResolverContext) {
      // Scope first: a request without one must fail before any model call.
      ctx.requireOrganizationScope();
      return createTodoAiWorkflowForContext(ctx).generateTodos(args.input);
    },
    async updateTodo(_parent: unknown, args: UpdateTodoArgs, ctx: ResolverContext) {
      return ctx.todos.update(args.id, args.input);
    },
    async deleteTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      return ctx.todos.delete(args.id);
    },
    async toggleTodo(_parent: unknown, args: TodoByIdArgs, ctx: ResolverContext) {
      return ctx.todos.toggle(args.id);
    }
  },
  Subscription: organizationSubscriptions([
    "todoCreated",
    "todoUpdated",
    "todoDeleted",
    "todoToggled"
  ])
};
