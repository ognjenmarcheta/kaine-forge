import { Button } from "@repo/ui";

import type { TodoItem } from "../todos.type";

interface TodoItemProps {
  item: TodoItem;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemRow({ item, onDelete, onEdit, onToggle }: TodoItemProps) {
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
      <p className="web-todos__description">{item.description || "-"}</p>
      <div className="web-todos__actions">
        <Button intent="subtle" size="sm" type="button" onClick={() => onEdit(item)}>
          Edit
        </Button>
        <Button intent="danger" size="sm" type="button" onClick={() => onDelete(item.id)}>
          Delete
        </Button>
      </div>
    </li>
  );
}
