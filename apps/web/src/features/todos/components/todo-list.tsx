import { TodoItemRow } from "./todo-item";
import type { TodoItem } from "../todos.type";

interface TodoListProps {
  items: TodoItem[];
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoList({ items, onDelete, onEdit, onToggle }: TodoListProps) {
  if (items.length === 0) {
    return <p className="web-muted">No todos yet. Create your first one.</p>;
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
