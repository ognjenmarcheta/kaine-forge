import { Button, Checkbox, Field, FieldLabel, FieldError, Input } from "@repo/ui";
import { useId, useState, type FormEvent } from "react";

import { ConfirmDialog } from "../../../components/confirm-dialog";
import {
  useAddTodoToNoteMutation,
  useDeleteTodoMutation,
  useToggleTodoMutation
} from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import type { NoteTodo } from "../notes.type";

interface NoteChecklistProps {
  noteId: string;
  todos: NoteTodo[];
  onChanged: () => void;
}

export function NoteChecklist({ noteId, onChanged, todos }: NoteChecklistProps) {
  const { t } = useTranslation();
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const inputId = useId();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleMutation = useToggleTodoMutation();
  const deleteMutation = useDeleteTodoMutation();
  const addMutation = useAddTodoToNoteMutation();
  const isPending = toggleMutation.isPending || deleteMutation.isPending || addMutation.isPending;

  async function handleToggle(id: string) {
    if (isPending) return;
    setError(null);
    try {
      await toggleMutation.mutateAsync({ id });
      onChanged();
    } catch {
      setError(t("error.generic"));
    }
  }

  async function handleDelete(id: string) {
    if (isPending) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync({ id });
      setDeletingId(null);
      onChanged();
    } catch {
      setError(t("error.generic"));
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTodoTitle.trim();

    if (isPending || title.length === 0) {
      return;
    }

    setError(null);
    try {
      await addMutation.mutateAsync({ input: { title }, noteId });
      setNewTodoTitle("");
      onChanged();
    } catch {
      setError(t("error.generic"));
    }
  }

  return (
    <div className="flex flex-col gap-[var(--ds-space-150)]">
      <ul className="ui-work-list">
        {todos.map((todo) => {
          const titleClassName = todo.completed
            ? "line-through text-[color:var(--ds-text-subtle)]"
            : "";

          return (
            <li key={todo.id} className="ui-work-row flex items-center gap-[var(--ds-space-100)]">
              <Checkbox
                aria-label={todo.title}
                disabled={isPending}
                checked={todo.completed}
                onCheckedChange={() => {
                  void handleToggle(todo.id);
                }}
              />
              <span className={`flex-1 ${titleClassName}`}>{todo.title}</span>
              <Button
                disabled={isPending}
                appearance="subtle"
                type="button"
                onClick={() => {
                  setError(null);
                  setDeletingId(todo.id);
                }}
              >
                {t("notes.delete")}
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="flex items-end gap-[var(--ds-space-100)]"
        onSubmit={(event) => void handleAdd(event)}
      >
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor={inputId}>{t("notes.checklistTitleLabel")}</FieldLabel>
          <Input
            id={inputId}
            disabled={isPending}
            placeholder={t("notes.addTodoPlaceholder")}
            value={newTodoTitle}
            onChange={(event) => setNewTodoTitle(event.target.value)}
          />
        </Field>
        <Button disabled={isPending} type="submit">
          {t("notes.addTodo")}
        </Button>
      </form>
      <div role="status">{error ? <FieldError>{error}</FieldError> : null}</div>
      <ConfirmDialog
        isOpen={Boolean(deletingId)}
        title={t("todos.deleteConfirmTitle")}
        message={error ?? t("todos.deleteConfirmMessage")}
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteMutation.isPending}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void handleDelete(deletingId);
        }}
      />
    </div>
  );
}
