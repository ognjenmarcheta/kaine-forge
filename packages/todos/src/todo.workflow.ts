export interface TodoDraft {
  description: string;
  title: string;
}

export interface TodoCompletionState {
  completed: boolean;
}

export interface TodoCreatePayload {
  description: string | null;
  title: string;
}

export interface TodoUpdatePayload extends TodoCreatePayload {
  completed: boolean;
}

export interface TodoClientWorkflowAdapter<TTodo> {
  createTodo?: (payload: TodoCreatePayload) => Promise<TTodo>;
  deleteTodo?: (id: string) => Promise<boolean>;
  invalidateTodos: (activeOrganizationId: string) => Promise<void>;
  toggleTodo?: (id: string) => Promise<TTodo>;
  updateTodo?: (id: string, payload: TodoUpdatePayload) => Promise<TTodo>;
}

interface ActiveOrganizationInput {
  activeOrganizationId: string | null;
}

interface CreateTodoWorkflowInput extends ActiveOrganizationInput {
  draft: TodoDraft;
}

interface UpdateTodoWorkflowInput extends ActiveOrganizationInput {
  current: TodoCompletionState;
  draft: TodoDraft;
  id: string;
}

interface TodoIdWorkflowInput extends ActiveOrganizationInput {
  id: string;
}

function normalizedDescription(description: string): string | null {
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toTodoCreatePayload(draft: TodoDraft): TodoCreatePayload {
  return {
    description: normalizedDescription(draft.description),
    title: draft.title.trim()
  };
}

export function toTodoUpdatePayload(
  draft: TodoDraft,
  current: TodoCompletionState
): TodoUpdatePayload {
  return {
    ...toTodoCreatePayload(draft),
    completed: current.completed
  };
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Number(kilobytes.toFixed(1)).toString()} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${Number(megabytes.toFixed(1)).toString()} MB`;
}

function requireActiveOrganizationId(activeOrganizationId: string | null): string {
  if (!activeOrganizationId) {
    throw new Error("active organization required");
  }

  return activeOrganizationId;
}

export function createTodoClientWorkflow<TTodo>(adapter: TodoClientWorkflowAdapter<TTodo>) {
  return {
    async create(input: CreateTodoWorkflowInput): Promise<TTodo> {
      const activeOrganizationId = requireActiveOrganizationId(input.activeOrganizationId);

      if (!adapter.createTodo) {
        throw new Error("create Todo adapter required");
      }

      const result = await adapter.createTodo(toTodoCreatePayload(input.draft));
      await adapter.invalidateTodos(activeOrganizationId);
      return result;
    },
    async delete(input: TodoIdWorkflowInput): Promise<boolean> {
      const activeOrganizationId = requireActiveOrganizationId(input.activeOrganizationId);

      if (!adapter.deleteTodo) {
        throw new Error("delete Todo adapter required");
      }

      const result = await adapter.deleteTodo(input.id);
      await adapter.invalidateTodos(activeOrganizationId);
      return result;
    },
    async toggle(input: TodoIdWorkflowInput): Promise<TTodo> {
      const activeOrganizationId = requireActiveOrganizationId(input.activeOrganizationId);

      if (!adapter.toggleTodo) {
        throw new Error("toggle Todo adapter required");
      }

      const result = await adapter.toggleTodo(input.id);
      await adapter.invalidateTodos(activeOrganizationId);
      return result;
    },
    async update(input: UpdateTodoWorkflowInput): Promise<TTodo> {
      const activeOrganizationId = requireActiveOrganizationId(input.activeOrganizationId);

      if (!adapter.updateTodo) {
        throw new Error("update Todo adapter required");
      }

      const result = await adapter.updateTodo(
        input.id,
        toTodoUpdatePayload(input.draft, input.current)
      );
      await adapter.invalidateTodos(activeOrganizationId);
      return result;
    }
  };
}
