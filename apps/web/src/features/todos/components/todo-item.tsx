import { Button, Checkbox } from "@repo/ui";

import { TodoAttachments } from "./todo-attachments";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoItemProps {
  item: TodoItem;
  onAttachmentChanged: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemRow({
  item,
  onAttachmentChanged,
  onDelete,
  onEdit,
  onToggle
}: TodoItemProps) {
  const { t } = useTranslation();

  return (
    <li className="grid grid-cols-1 items-center gap-[var(--ds-space-150)] rounded-[var(--ds-radius-200)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-[var(--ds-space-150)] py-[calc(var(--ds-space-100)+var(--ds-space-025))] md:grid-cols-[minmax(240px,_1fr)_minmax(120px,_1fr)_auto]">
      <label className="flex items-center gap-[var(--ds-space-100)]">
        <Checkbox
          aria-label={item.title}
          checked={item.completed}
          onCheckedChange={() => {
            onToggle(item);
          }}
        />
        <span
          className={
            item.completed
              ? "text-[color:var(--ds-text-subtle)] line-through"
              : "text-[color:var(--ds-text)]"
          }
        >
          {item.title}
        </span>
      </label>
      <p className="m-0 text-[color:var(--ds-text-subtle)]">
        {item.description || t("common.notAvailable")}
      </p>
      <div className="flex gap-[var(--ds-space-100)]">
        <Button appearance="subtle" spacing="compact" type="button" onClick={() => onEdit(item)}>
          {t("button.edit")}
        </Button>
        <Button
          appearance="danger"
          spacing="compact"
          type="button"
          onClick={() => onDelete(item.id)}
        >
          {t("button.delete")}
        </Button>
      </div>
      <div className="md:col-span-3">
        <TodoAttachments
          attachments={item.attachments}
          todoId={item.id}
          onChanged={onAttachmentChanged}
        />
      </div>
    </li>
  );
}
