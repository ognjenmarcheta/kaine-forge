export interface TodoDraft {
  description: string;
  title: string;
}

export interface TodoCreatePayload {
  description: string | null;
  title: string;
}

export type TodoUpdatePayload = TodoCreatePayload;

export interface TodoClientWorkflowAdapter<TTodo> {
  createTodo?: (payload: TodoCreatePayload) => Promise<TTodo>;
  deleteTodo?: (id: string) => Promise<boolean>;
  getActiveOrganizationId: () => string | null;
  invalidateTodos: () => Promise<void>;
  toggleTodo?: (id: string) => Promise<TTodo>;
  updateTodo?: (id: string, payload: TodoUpdatePayload) => Promise<TTodo>;
}

interface CreateTodoWorkflowInput {
  draft: TodoDraft;
}

interface UpdateTodoWorkflowInput {
  draft: TodoDraft;
  id: string;
}

interface TodoIdWorkflowInput {
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

export function toTodoUpdatePayload(draft: TodoDraft): TodoUpdatePayload {
  return toTodoCreatePayload(draft);
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

/** @deprecated Use createActiveOrganizationQueryKey from @repo/query instead. */
export function createTodoListQueryKey(input: {
  activeOrganizationId: string | null;
  queryKey: readonly unknown[];
}): readonly unknown[] {
  return [...input.queryKey, input.activeOrganizationId ?? "inactive"];
}

function requireActiveOrganizationId(activeOrganizationId: string | null): string {
  if (!activeOrganizationId) {
    throw new Error("active organization required");
  }

  return activeOrganizationId;
}

export function createTodoClientWorkflow<TTodo>(adapter: TodoClientWorkflowAdapter<TTodo>) {
  async function invalidateActiveOrganizationTodos(): Promise<void> {
    await adapter.invalidateTodos();
  }

  return {
    async create(input: CreateTodoWorkflowInput): Promise<TTodo> {
      requireActiveOrganizationId(adapter.getActiveOrganizationId());

      if (!adapter.createTodo) {
        throw new Error("create Todo adapter required");
      }

      const result = await adapter.createTodo(toTodoCreatePayload(input.draft));
      await invalidateActiveOrganizationTodos();
      return result;
    },
    async delete(input: TodoIdWorkflowInput): Promise<boolean> {
      requireActiveOrganizationId(adapter.getActiveOrganizationId());

      if (!adapter.deleteTodo) {
        throw new Error("delete Todo adapter required");
      }

      const result = await adapter.deleteTodo(input.id);
      await invalidateActiveOrganizationTodos();
      return result;
    },
    async toggle(input: TodoIdWorkflowInput): Promise<TTodo> {
      requireActiveOrganizationId(adapter.getActiveOrganizationId());

      if (!adapter.toggleTodo) {
        throw new Error("toggle Todo adapter required");
      }

      const result = await adapter.toggleTodo(input.id);
      await invalidateActiveOrganizationTodos();
      return result;
    },
    async update(input: UpdateTodoWorkflowInput): Promise<TTodo> {
      requireActiveOrganizationId(adapter.getActiveOrganizationId());

      if (!adapter.updateTodo) {
        throw new Error("update Todo adapter required");
      }

      const result = await adapter.updateTodo(input.id, toTodoUpdatePayload(input.draft));
      await invalidateActiveOrganizationTodos();
      return result;
    }
  };
}
