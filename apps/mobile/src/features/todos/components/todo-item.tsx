import { Badge, Button, Card, Checkbox, Text } from "@repo/mobile-ui";
import { Pressable, View } from "react-native";

import { TodoAttachments } from "./todo-attachments";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

interface TodoItemCardProps {
  item: TodoItem;
  onAttachmentChanged: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoItemCard({
  item,
  onAttachmentChanged,
  onDelete,
  onEdit,
  onToggle
}: TodoItemCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="p-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row flex-1 items-start gap-3">
          <Checkbox checked={item.completed} onCheckedChange={() => onToggle(item)} />
          <Pressable className="flex-1" onPress={() => onToggle(item)}>
            <Text className="font-medium text-ds-text">{item.title}</Text>
            {item.description ? (
              <Text className="mt-1 text-sm text-ds-text-subtle">{item.description}</Text>
            ) : null}
            <Badge appearance={item.completed ? "success" : "warning"} className="mt-2">
              {item.completed ? t("todos.completed") : t("todos.pending")}
            </Badge>
          </Pressable>
        </View>

        <View className="flex-row gap-2">
          <Button appearance="secondary" spacing="compact" onPress={() => onEdit(item)}>
            {t("button.edit")}
          </Button>
          <Button appearance="danger" spacing="compact" onPress={() => onDelete(item.id)}>
            {t("button.delete")}
          </Button>
        </View>
      </View>
      <TodoAttachments
        attachments={item.attachments}
        todoId={item.id}
        onChanged={onAttachmentChanged}
      />
    </Card>
  );
}
