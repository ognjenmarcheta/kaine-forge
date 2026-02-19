import { Button } from "@repo/ui";

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
    <li className="web-todos__item">
      <label className="web-todos__toggle">
        <input
          checked={item.completed}
          type="checkbox"
          onChange={() => {
            onToggle(item);
          }}
        />
        <span
          className={
            item.completed ? "web-todos__title web-todos__title--completed" : "web-todos__title"
          }
        >
          {item.title}
        </span>
      </label>
      <p className="web-todos__description">{item.description || t("common.notAvailable")}</p>
      <div className="web-todos__actions">
        <Button intent="subtle" size="sm" type="button" onClick={() => onEdit(item)}>
          {t("button.edit")}
        </Button>
        <Button intent="danger" size="sm" type="button" onClick={() => onDelete(item.id)}>
          {t("button.delete")}
        </Button>
      </div>
    </li>
  );
}
