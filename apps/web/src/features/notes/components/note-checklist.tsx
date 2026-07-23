import { Button, Checkbox, Input } from "@repo/ui";
import { useState, type FormEvent } from "react";

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

  const toggleMutation = useToggleTodoMutation();
  const deleteMutation = useDeleteTodoMutation();
  const addMutation = useAddTodoToNoteMutation();

  async function handleToggle(id: string) {
    await toggleMutation.mutateAsync({ id });
    onChanged();
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync({ id });
    onChanged();
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTodoTitle.trim();

    if (title.length === 0) {
      return;
    }

    await addMutation.mutateAsync({ input: { title }, noteId });
    setNewTodoTitle("");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-[var(--ds-space-150)]">
      <ul className="flex flex-col gap-[var(--ds-space-100)]">
        {todos.map((todo) => {
          const titleClassName = todo.completed
            ? "line-through text-[color:var(--ds-text-subtle)]"
            : "";

          return (
            <li key={todo.id} className="flex items-center gap-[var(--ds-space-100)]">
              <Checkbox
                checked={todo.completed}
                onCheckedChange={() => {
                  void handleToggle(todo.id);
                }}
              />
              <span className={`flex-1 ${titleClassName}`}>{todo.title}</span>
              <Button
                appearance="subtle"
                type="button"
                onClick={() => {
                  void handleDelete(todo.id);
                }}
              >
                {t("notes.delete")}
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="flex items-center gap-[var(--ds-space-100)]"
        onSubmit={(event) => void handleAdd(event)}
      >
        <Input
          placeholder={t("notes.addTodoPlaceholder")}
          value={newTodoTitle}
          onChange={(event) => setNewTodoTitle(event.target.value)}
        />
        <Button disabled={addMutation.status === "pending"} type="submit">
          {t("notes.addTodo")}
        </Button>
      </form>
    </div>
  );
}
