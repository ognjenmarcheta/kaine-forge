import { Text } from "@repo/mobile-ui";
import { FlatList } from "react-native";

import { TodoItemCard } from "./todo-item";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoListProps {
  items: TodoItem[];
  onAttachmentChanged: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoList({
  items,
  onAttachmentChanged,
  onDelete,
  onEdit,
  onToggle
}: TodoListProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <Text className="text-sm text-ds-text-subtle">{t("todos.empty")}</Text>;
  }

  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TodoItemCard
          item={item}
          onAttachmentChanged={onAttachmentChanged}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      )}
    />
  );
}
