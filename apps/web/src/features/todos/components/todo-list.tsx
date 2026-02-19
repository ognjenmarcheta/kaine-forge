import { TodoItemRow } from "./todo-item";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoListProps {
  items: TodoItem[];
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoList({ items, onDelete, onEdit, onToggle }: TodoListProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <p className="web-muted">{t("todos.empty")}</p>;
  }

  return (
    <ul className="web-todos__list">
      {items.map((item) => (
        <TodoItemRow
          key={item.id}
          item={item}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
