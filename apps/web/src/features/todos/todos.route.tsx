import { Button } from "@repo/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient } from "urql";

import { TodoCreateDialog } from "./components/todo-create-dialog";
import { TodoEditDialog } from "./components/todo-edit-dialog";
import { TodoList } from "./components/todo-list";
import { createTodo, deleteTodo, listTodos, updateTodo } from "./todos.adapter";
import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { useTranslation } from "../../hooks/use-translation";

export function TodosRoute() {
  const { t } = useTranslation();
  const client = useClient();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
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
      await reloadTodos();
      setEditingTodo(null);
    } catch {
      setError(t("error.generic"));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("todos.deleteConfirmMessage"))) {
      return;
    }

    try {
      setError(null);
      await deleteTodo(client, id);
      await reloadTodos();
    } catch {
      setError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setError(null);
      await updateTodo(client, item.id, {
        completed: !item.completed,
        description: item.description,
        title: item.title
      });
      await reloadTodos();
    } catch {
      setError(t("error.generic"));
    }
  }

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
