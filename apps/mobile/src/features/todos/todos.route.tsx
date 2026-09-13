import { Button, Skeleton, Text } from "@repo/mobile-ui";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { createTodoClientWorkflow } from "@repo/todos";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { TodoFormModal } from "./components/todo-form-modal";
import { TodoList } from "./components/todo-list";
import { TODOS_CONFIG } from "./todos.config";
import { TODO_DEFINITION } from "./todos.definition";
import type { TodoDraft, TodoItem } from "./todos.type";
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
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("todos.mobile.list", useGetMobileTodosQuery.getKey());

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

  const invalidateTodos = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: todosQueryKey
    });
  }, [activeOrganizationId, queryClient, todosQueryKey]);

  const todoWorkflow = useMemo(
    () =>
      createTodoClientWorkflow<TodoItem>({
        createTodo: async (payload) => {
          const result = await createMutation.mutateAsync({
            input: payload
          });
          return result.createTodo;
        },
        deleteTodo: async (id) => {
          const result = await deleteMutation.mutateAsync({
            id
          });
          return result.deleteTodo;
        },
        getActiveOrganizationId: () => activeOrganizationId,
        invalidateTodos,
        toggleTodo: async (id) => {
          const result = await toggleMutation.mutateAsync({
            id
          });
          return result.toggleTodo;
        },
        updateTodo: async (id, payload) => {
          const result = await updateMutation.mutateAsync({
            id,
            input: payload
          });
          return result.updateTodo;
        }
      }),
    [
      activeOrganizationId,
      createMutation,
      deleteMutation,
      invalidateTodos,
      toggleMutation,
      updateMutation
    ]
  );

  const todos = useMemo(() => todosQuery.data?.todos ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  async function handleCreate(draft: TodoDraft) {
    try {
      setActionError(null);
      await todoWorkflow.create({
        draft
      });
    } catch (error) {
      setActionError(t("error.generic"));
      throw error;
    }
  }

  async function handleEdit(draft: TodoDraft) {
    if (!editingTodo) {
      return;
    }

    try {
      setActionError(null);
      await todoWorkflow.update({
        draft,
        id: editingTodo.id
      });
      setEditingTodo(null);
    } catch (error) {
      setActionError(t("error.generic"));
      throw error;
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
      await todoWorkflow.delete({
        id: deletingTodoId
      });
      setDeletingTodoId(null);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await todoWorkflow.toggle({
        id: item.id
      });
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

      {error ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" className="text-sm text-ds-text-danger">
            {error}
          </Text>
          <Button appearance="secondary" onPress={() => void todosQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </View>
      ) : null}
      {isLoading ? (
        <View
          accessibilityLabel={t("todos.loading")}
          accessibilityState={{ busy: true }}
          className="gap-4"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </View>
      ) : null}
      {!isLoading && !todosQuery.error ? (
        <TodoList
          items={todos}
          onAttachmentChanged={() => {
            void invalidateTodos();
          }}
          onDelete={handleDelete}
          onEdit={(item) => setEditingTodo(item)}
          onToggle={(item) => void handleToggle(item)}
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
