import { Pressable, Text, View } from "react-native";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoItemCardProps {
  item: TodoItem;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemCard({ item, onDelete, onEdit, onToggle }: TodoItemCardProps) {
  const { t } = useTranslation();

  return (
    <View className="rounded-lg border border-ds-border bg-ds-surface p-3">
      <View className="flex-row items-start justify-between gap-3">
        <Pressable className="flex-1" onPress={() => onToggle(item)}>
          <Text className="text-base font-medium text-ds-text">{item.title}</Text>
          {item.description ? (
            <Text className="mt-1 text-sm text-ds-text-subtle">{item.description}</Text>
          ) : null}
          <Text className="mt-1 text-xs text-ds-text-subtle">
            {item.completed ? t("todos.completed") : t("todos.pending")}
          </Text>
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            className="rounded-md border border-ds-border px-2 py-1"
            onPress={() => onEdit(item)}
          >
            <Text className="text-xs text-ds-text">{t("button.edit")}</Text>
          </Pressable>
          <Pressable
            className="rounded-md border border-ds-border-danger px-2 py-1"
            onPress={() => onDelete(item.id)}
          >
            <Text className="text-xs text-ds-text-danger">{t("button.delete")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
