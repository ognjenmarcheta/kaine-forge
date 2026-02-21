import { Button, Checkbox } from "@repo/ui";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoItemProps {
  item: TodoItem;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemRow({ item, onDelete, onEdit, onToggle }: TodoItemProps) {
  const { t } = useTranslation();

  return (
    <li className="grid grid-cols-1 items-center gap-ds-150 rounded-md border bg-ds-surface px-ds-150 py-2.5 md:grid-cols-[minmax(240px,_1fr)_minmax(120px,_1fr)_auto]">
      <label className="flex items-center gap-ds-100">
        <Checkbox
          aria-label={item.title}
          checked={item.completed}
          onCheckedChange={() => {
            onToggle(item);
          }}
        />
        <span className={item.completed ? "text-ds-text-subtle line-through" : "text-ds-text"}>
          {item.title}
        </span>
      </label>
      <p className="m-0 text-ds-text-subtle">{item.description || t("common.notAvailable")}</p>
      <div className="flex gap-ds-100">
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
    </li>
  );
}
