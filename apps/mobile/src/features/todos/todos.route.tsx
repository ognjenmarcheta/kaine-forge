import { Button, Text } from "@repo/mobile-ui";
import { createActiveOrganizationQueryKey, registerOrgScopedQueryKey } from "@repo/query";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { TodoFormModal } from "./components/todo-form-modal";
import { TodoList } from "./components/todo-list";
import { TODOS_CONFIG } from "./todos.config";
import { TODO_DEFINITION } from "./todos.definition";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { ConfirmModal } from "../../components/confirm-modal";
import { ScreenContainer } from "../../components/screen-container";
import {
  useCreateMobileTodoMutation,
  useDeleteMobileTodoMutation,
  useGetMobileTodosQuery,
  useToggleMobileTodoMutation,
  useUpdateMobileTodoMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

registerOrgScopedQueryKey(useGetMobileTodosQuery.getKey());

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
      createActiveOrganizationQueryKey(
        useGetMobileTodosQuery.getKey(listVariables),
        activeOrganizationId
      ),
    [activeOrganizationId, listVariables]
  );

  const todosQuery = useGetMobileTodosQuery(listVariables, {
    queryKey: todosQueryKey,
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const createMutation = useCreateMobileTodoMutation();

  const updateMutation = useUpdateMobileTodoMutation();

  const deleteMutation = useDeleteMobileTodoMutation();

  const toggleMutation = useToggleMobileTodoMutation();

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
    <ScreenContainer>
      <View className="mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-semibold text-ds-text">{t("todos.title")}</Text>
          <Text className="text-sm text-ds-text-subtle">{completionSummary}</Text>
        </View>
        <Button spacing="compact" onPress={() => setIsCreateOpen(true)}>
          {t("todos.create")}
        </Button>
      </View>

      {error ? <Text className="mb-2 text-sm text-ds-text-danger">{error}</Text> : null}
      {isLoading ? <Text className="text-sm text-ds-text-subtle">{t("todos.loading")}</Text> : null}
      {!isLoading ? (
        <TodoList
          items={todos}
          onAttachmentChanged={() => {
            void invalidateTodos(todosQueryKey);
          }}
          onDelete={handleDelete}
          onEdit={(item) => setEditingTodo(item)}
          onToggle={handleToggle}
        />
      ) : null}

      <TodoFormModal
        initialDraft={TODO_DEFINITION.emptyDraft}
        isOpen={isCreateOpen}
        title={t("todos.create")}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <TodoFormModal
        initialDraft={{
          description: editingTodo?.description ?? "",
          title: editingTodo?.title ?? ""
        }}
        isOpen={Boolean(editingTodo)}
        title={t("todos.editTitle")}
        onClose={() => setEditingTodo(null)}
        onSubmit={handleEdit}
      />
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmingLabel={t("common.loadingShort")}
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
    </ScreenContainer>
  );
}
