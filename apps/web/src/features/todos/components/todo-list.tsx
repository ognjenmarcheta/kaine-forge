import { TodoItemRow, type TodoItemProps } from "./todo-item";
import type { TodoItem } from "../todos.type";
interface TodoListProps extends Omit<TodoItemProps, "item" | "busy" | "error"> {
  items: TodoItem[];
  pending: string[];
  errors: Record<string, string>;
}
export function TodoList({ items, pending, errors, ...actions }: TodoListProps) {
  return (
    <ul className="ui-work-list">
      {items.map((item) => (
        <TodoItemRow
          key={item.id}
          item={item}
          busy={pending.includes(item.id)}
          error={errors[item.id]}
          {...actions}
        />
      ))}
    </ul>
  );
}
