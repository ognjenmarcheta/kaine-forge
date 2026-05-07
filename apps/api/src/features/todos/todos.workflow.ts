import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

export interface TodoWorkflowAdapter {
  deleteTodo: (scope: AuthenticatedOrganizationScope, id: string) => Promise<boolean>;
  deleteTodoAttachments: (scope: AuthenticatedOrganizationScope, id: string) => Promise<void>;
}

export function createTodoWorkflow(adapter: TodoWorkflowAdapter) {
  return {
    async deleteTodo(scope: AuthenticatedOrganizationScope, id: string): Promise<boolean> {
      await adapter.deleteTodoAttachments(scope, id);
      return adapter.deleteTodo(scope, id);
    }
  };
}
