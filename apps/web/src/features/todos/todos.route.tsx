import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { TodoCreateDialog } from "./components/todo-create-dialog";
import { TodoEditDialog } from "./components/todo-edit-dialog";
import { TodoList } from "./components/todo-list";
import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  useCreateTodoMutation,
  useDeleteTodoMutation,
  useGetTodosQuery,
  useToggleTodoMutation,
  useUpdateTodoMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

export function TodosRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listVariables = useMemo(
    () => ({
      limit: TODOS_CONFIG.pageSize,
      offset: 0
    }),
    []
  );
  const todosQueryKey = useMemo(
    () =>
      activeOrganizationId
        ? [...useGetTodosQuery.getKey(listVariables), activeOrganizationId]
        : ["GetTodos", "inactive"],
    [activeOrganizationId, listVariables]
  );

  const todosQuery = useGetTodosQuery(listVariables, {
    queryKey: todosQueryKey,
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const createMutation = useCreateTodoMutation();

  const updateMutation = useUpdateTodoMutation();

  const deleteMutation = useDeleteTodoMutation();

  const toggleMutation = useToggleTodoMutation();

  const invalidateTodos = async (queryKey: readonly unknown[]) => {
    if (!activeOrganizationId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey
    });
  };

  const todos = useMemo(() => todosQuery.data?.todos ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  async function handleCreate(draft: TodoDraft) {
    try {
      setActionError(null);
      await createMutation.mutateAsync({
        input: toCreatePayload(draft)
      });
      await invalidateTodos(todosQueryKey);
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
        id: editingTodo.id,
        input: toUpdatePayload(draft, editingTodo)
      });
      setEditingTodo(null);
      await invalidateTodos(todosQueryKey);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  function handleDelete(id: string) {
    setDeletingTodoId(id);
  }

  async function confirmDelete() {
    if (!deletingTodoId) {
      return;
    }

    try {
      setActionError(null);
      await deleteMutation.mutateAsync({
        id: deletingTodoId
      });
      setDeletingTodoId(null);
      await invalidateTodos(todosQueryKey);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await toggleMutation.mutateAsync({
        id: item.id
      });
      await invalidateTodos(todosQueryKey);
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
      <ConfirmDialog
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteMutation.status === "pending"}
        isOpen={Boolean(deletingTodoId)}
        message={t("todos.deleteConfirmMessage")}
        title={t("todos.deleteConfirmTitle")}
        onCancel={() => setDeletingTodoId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
