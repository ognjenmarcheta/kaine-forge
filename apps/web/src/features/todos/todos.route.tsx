import { queryKeys } from "@repo/query";
import { Button } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { TodoCreateDialog } from "./components/todo-create-dialog";
import { TodoEditDialog } from "./components/todo-edit-dialog";
import { TodoList } from "./components/todo-list";
import { createTodo, deleteTodo, listTodos, updateTodo } from "./todos.adapter";
import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { useAuth } from "../../hooks/use-auth";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { createGraphqlClient } from "../../lib/graphql-client";

export function TodosRoute() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const client = useMemo(() => createGraphqlClient(session), [session]);
  const listVariables = useMemo(
    () => ({
      limit: TODOS_CONFIG.pageSize,
      offset: 0
    }),
    []
  );

  const todosQuery = useQuery({
    queryKey: activeOrganizationId
      ? queryKeys.todos(activeOrganizationId, listVariables)
      : ["todos", "inactive"],
    queryFn: () => listTodos(client, listVariables),
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const createMutation = useMutation({
    mutationFn: (draft: TodoDraft) => createTodo(client, toCreatePayload(draft))
  });

  const updateMutation = useMutation({
    mutationFn: (input: { draft: TodoDraft; id: string; current: TodoItem }) =>
      updateTodo(client, input.id, toUpdatePayload(input.draft, input.current))
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTodo(client, id)
  });

  const invalidateTodos = async () => {
    if (!activeOrganizationId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["todos", activeOrganizationId]
    });
  };

  const todos = useMemo(() => todosQuery.data ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  async function handleCreate(draft: TodoDraft) {
    try {
      setActionError(null);
      await createMutation.mutateAsync(draft);
      await invalidateTodos();
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleEdit(draft: TodoDraft) {
    if (!editingTodo) {
      return;
    }

    try {
      setActionError(null);
      await updateMutation.mutateAsync({
        draft,
        id: editingTodo.id,
        current: editingTodo
      });
      setEditingTodo(null);
      await invalidateTodos();
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("todos.deleteConfirmMessage"))) {
      return;
    }

    try {
      setActionError(null);
      await deleteMutation.mutateAsync(id);
      await invalidateTodos();
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await updateMutation.mutateAsync({
        draft: {
          description: item.description ?? "",
          title: item.title
        },
        id: item.id,
        current: {
          ...item,
          completed: !item.completed
        }
      });
      await invalidateTodos();
    } catch {
      setActionError(t("error.generic"));
    }
  }

  const isLoading = isOrganizationLoading || todosQuery.status === "pending";
  const error = actionError ?? (todosQuery.error ? t("error.generic") : null);

  return (
    <section className="web-todos">
      <header className="web-todos__header">
        <div>
          <h1>{t("todos.title")}</h1>
          <p className="web-muted">{completionSummary}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>{t("todos.create")}</Button>
      </header>

      {isLoading ? <p className="web-muted">{t("todos.loading")}</p> : null}
      {error ? <p className="web-form__error">{error}</p> : null}
      {!isLoading ? (
        <TodoList
          items={todos}
          onDelete={handleDelete}
          onEdit={(item) => setEditingTodo(item)}
          onToggle={handleToggle}
        />
      ) : null}

      <TodoCreateDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <TodoEditDialog
        isOpen={Boolean(editingTodo)}
        todo={editingTodo}
        onClose={() => setEditingTodo(null)}
        onSubmit={handleEdit}
      />
    </section>
  );
}
