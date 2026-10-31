import { Button, Checkbox, Field, FieldLabel, FieldError, Input } from "@repo/ui";
import { useId, useState, type FormEvent } from "react";

import { ConfirmDialog } from "../../../components/confirm-dialog";
import { useSyncEngine } from "../../../hooks/use-sync";
import { useTranslation } from "../../../hooks/use-translation";
import type { NoteTodo } from "../notes.type";

interface NoteChecklistProps {
  noteId: string;
  todos: NoteTodo[];
  onChanged: () => void;
  onPendingChange: (pending: boolean) => void;
}

export function NoteChecklist({ noteId, onChanged, onPendingChange, todos }: NoteChecklistProps) {
  const { t } = useTranslation();
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const inputId = useId();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const engine = useSyncEngine();
  // Checklist writes apply at once on the device; only one that cannot start fails here.
  const [isPending, setIsPending] = useState(false);

  async function run(
    action: (sync: NonNullable<typeof engine>) => Promise<unknown>,
    failure: string
  ) {
    if (isPending || !engine) return false;
    setError(null);
    setIsPending(true);
    onPendingChange(true);
    try {
      await action(engine);
      onChanged();
      return true;
    } catch {
      setError(t(failure));
      return false;
    } finally {
      setIsPending(false);
      onPendingChange(false);
    }
  }

  async function handleToggle(todo: NoteTodo) {
    // Sets the state the user sees, never flips it: a replayed change stays correct.
    await run(
      (sync) => sync.updateTodo(todo.id, { completed: !todo.completed }),
      "notes.toggleFailed"
    );
  }

  async function handleDelete(id: string) {
    if (await run((sync) => sync.deleteTodo(id), "notes.checklistDeleteFailed")) {
      setDeletingId(null);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTodoTitle.trim();

    if (title.length === 0) {
      return;
    }

    if (await run((sync) => sync.createTodo({ title, noteId }), "notes.addFailed")) {
      setNewTodoTitle("");
    }
  }

  return (
    <div className="flex flex-col gap-ds-150">
      <ul className="ui-work-list">
        {todos.map((todo) => {
          const titleClassName = todo.completed ? "line-through text-ds-text-subtle" : "";

          return (
            <li key={todo.id} className="ui-work-row flex items-center gap-ds-100">
              <Checkbox
                aria-label={todo.title}
                disabled={isPending}
                checked={todo.completed}
                onCheckedChange={() => {
                  void handleToggle(todo);
                }}
              />
              <span className={`min-w-0 flex-1 break-words ${titleClassName}`}>{todo.title}</span>
              <Button
                disabled={isPending}
                appearance="subtle"
                type="button"
                onClick={() => {
                  setError(null);
                  setDeletingId(todo.id);
                }}
              >
                {t("notes.deleteTodo")}
              </Button>
            </li>
          );
        })}
      </ul>
      <form className="flex items-end gap-ds-100" onSubmit={(event) => void handleAdd(event)}>
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
        <Button disabled={isPending || newTodoTitle.trim().length === 0} type="submit">
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
        isConfirming={isPending}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) void handleDelete(deletingId);
        }}
      />
    </div>
  );
}
