import { queryKeys } from "@repo/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { TodoFormModal } from "./components/todo-form-modal";
import { TodoList } from "./components/todo-list";
import { createTodo, deleteTodo, listTodos, toggleTodo, updateTodo } from "./todos.adapter";
import { TODOS_CONFIG } from "./todos.config";
import { TODO_DEFINITION } from "./todos.definition";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { ScreenContainer } from "../../components/screen-container";
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

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleTodo(client, id)
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

  function handleDelete(id: string) {
    Alert.alert(t("todos.deleteConfirmTitle"), t("todos.deleteConfirmMessage"), [
      {
        style: "cancel",
        text: t("button.cancel")
      },
      {
        style: "destructive",
        text: t("button.delete"),
        onPress: () => {
          void (async () => {
            try {
              setActionError(null);
              await deleteMutation.mutateAsync(id);
              await invalidateTodos();
            } catch {
              setActionError(t("error.generic"));
            }
          })();
        }
      }
    ]);
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await toggleMutation.mutateAsync(item.id);
      await invalidateTodos();
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
          <Text className="text-2xl font-semibold text-text-default">{t("todos.title")}</Text>
          <Text className="text-sm text-text-subtle">{completionSummary}</Text>
        </View>
        <Pressable
          className="rounded-md bg-background-brand px-3 py-2"
          onPress={() => setIsCreateOpen(true)}
        >
          <Text className="font-medium text-text-inverse">{t("todos.create")}</Text>
        </Pressable>
      </View>

      {error ? <Text className="mb-2 text-sm text-text-danger">{error}</Text> : null}
      {isLoading ? <Text className="text-sm text-text-subtle">{t("todos.loading")}</Text> : null}
      {!isLoading ? (
        <TodoList
          items={todos}
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
    </ScreenContainer>
  );
}
