import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useClient } from "urql";

import { TodoFormModal } from "./components/todo-form-modal";
import { TodoList } from "./components/todo-list";
import { createTodo, deleteTodo, listTodos, toggleTodo, updateTodo } from "./todos.adapter";
import { TODOS_CONFIG } from "./todos.config";
import { TODO_DEFINITION } from "./todos.definition";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { ScreenContainer } from "../../components/screen-container";
import { useTranslation } from "../../hooks/use-translation";

export function TodosRoute() {
  const { t } = useTranslation();
  const client = useClient();

  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  const reloadTodos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const items = await listTodos(client, {
        limit: TODOS_CONFIG.pageSize,
        offset: 0
      });
      setTodos(items);
    } catch {
      setError(t("error.generic"));
    } finally {
      setIsLoading(false);
    }
  }, [client, t]);

  useEffect(() => {
    void reloadTodos();
  }, [reloadTodos]);

  async function handleCreate(draft: TodoDraft) {
    try {
      setError(null);
      await createTodo(client, toCreatePayload(draft));
      await reloadTodos();
    } catch {
      setError(t("error.generic"));
    }
  }

  async function handleEdit(draft: TodoDraft) {
    if (!editingTodo) {
      return;
    }

    try {
      setError(null);
      await updateTodo(client, editingTodo.id, toUpdatePayload(draft, editingTodo));
      setEditingTodo(null);
      await reloadTodos();
    } catch {
      setError(t("error.generic"));
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
              setError(null);
              await deleteTodo(client, id);
              await reloadTodos();
            } catch {
              setError(t("error.generic"));
            }
          })();
        }
      }
    ]);
  }

  async function handleToggle(item: TodoItem) {
    try {
      setError(null);
      await toggleTodo(client, item.id);
      await reloadTodos();
    } catch {
      setError(t("error.generic"));
    }
  }

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
