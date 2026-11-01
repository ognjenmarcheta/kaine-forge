import { Badge, Button, Skeleton, Text } from "@repo/mobile-ui";
import { createTodoClientWorkflow } from "@repo/todos";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { TodoFormModal } from "./components/todo-form-modal";
import { TodoList } from "./components/todo-list";
import { TODO_DEFINITION } from "./todos.definition";
import type { TodoDraft, TodoItem } from "./todos.type";
import { ConfirmModal } from "../../components/confirm-modal";
import { ScreenContainer } from "../../components/screen-container";
import { useOrganization } from "../../hooks/use-organization";
import { useSyncEngine, useSyncRejection, useSyncStatus } from "../../hooks/use-sync";
import { useTranslation } from "../../hooks/use-translation";

const STATUS_APPEARANCE = {
  online: "success",
  offline: "warning",
  syncing: "information",
  error: "danger",
  signedOut: "danger"
} as const;

export function TodosRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const engine = useSyncEngine();
  const syncStatus = useSyncStatus();
  const { rejection, dismissRejection } = useSyncRejection();
  const enabled = Boolean(activeOrganizationId) && !isOrganizationLoading;
  const live = useLiveQuery(() => (enabled ? engine?.todos : null));

  const invalidateTodos = useCallback(async () => {
    // Offline the pull fails; the status badge already shows it.
    await engine?.pull().catch(() => undefined);
  }, [engine]);

  // Writes go to the device at once and sync when the network allows.
  const todoWorkflow = useMemo(() => {
    function requireEngine() {
      if (!engine) throw new Error("sync is not ready");
      return engine;
    }
    return createTodoClientWorkflow<TodoItem | undefined>({
      createTodo: async (payload) => {
        const id = await requireEngine().createTodo(payload);
        return requireEngine().todos.get(id);
      },
      deleteTodo: async (id) => {
        await requireEngine().deleteTodo(id);
        return true;
      },
      getActiveOrganizationId: () => activeOrganizationId,
      invalidateTodos,
      // Sets the state the user sees, never flips it: a replayed change stays correct.
      toggleTodo: async (id) => {
        const sync = requireEngine();
        const current = sync.todos.get(id);
        if (!current) throw new Error("todo not found");
        await sync.updateTodo(id, { completed: !current.completed });
        return sync.todos.get(id);
      },
      updateTodo: async (id, payload) => {
        await requireEngine().updateTodo(id, payload);
        return requireEngine().todos.get(id);
      }
    });
  }, [activeOrganizationId, invalidateTodos, engine]);

  const todos = useMemo(
    () => [...(live.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [live.data]
  );
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

  const isLoading = isOrganizationLoading || !live.isReady;
  const error = actionError ?? (rejection ? t(`sync.rejected.${rejection.code}`) : null);

  return (
    <ScreenContainer>
      <View className="mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-semibold text-ds-text">{t("todos.title")}</Text>
          <Text className="text-sm text-ds-text-subtle">{completionSummary}</Text>
          {syncStatus ? (
            <View
              accessibilityLabel={t("sync.status.label")}
              accessibilityRole="text"
              className="mt-1 flex-row items-center gap-2"
            >
              <Badge appearance={STATUS_APPEARANCE[syncStatus.state]}>
                {t(`sync.status.${syncStatus.state}`)}
              </Badge>
              {syncStatus.pending > 0 ? (
                <Badge accessibilityLabel={t("sync.status.pending")}>
                  {syncStatus.pending.toString()}
                </Badge>
              ) : null}
            </View>
          ) : null}
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
          <Button
            appearance="secondary"
            onPress={() => {
              setActionError(null);
              dismissRejection();
              void invalidateTodos();
            }}
          >
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
      {!isLoading ? (
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
        isConfirming={false}
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
