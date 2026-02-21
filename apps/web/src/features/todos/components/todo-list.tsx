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
    return <p className="text-ds-text-subtle">{t("todos.empty")}</p>;
  }

  return (
    <ul className="m-0 grid list-none gap-ds-100 p-0">
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
