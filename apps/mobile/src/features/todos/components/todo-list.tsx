import { Button, Text } from "@repo/mobile-ui";
import { FlatList, View } from "react-native";

import { TodoItemCard } from "./todo-item";
import { useTranslation } from "../../../hooks/use-translation";
import type { TodoItem } from "../todos.type";

/** Older Todos the first pull left on the server, loaded from the end of the list. */
interface OlderTodos {
  hasOlder: boolean;
  needsConnection: boolean;
  loading: boolean;
  failed: boolean;
  load: () => Promise<void>;
}

interface TodoListProps {
  items: TodoItem[];
  older: OlderTodos;
  onAttachmentChanged: () => void;
  onDelete: (id: string) => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (item: TodoItem) => void;
}

export function TodoList({
  items,
  older,
  onAttachmentChanged,
  onDelete,
  onEdit,
  onToggle
}: TodoListProps) {
  const { t } = useTranslation();

  const footer = older.hasOlder ? (
    <View className="gap-2 py-3">
      {older.failed ? (
        <Text accessibilityRole="alert" className="text-sm text-ds-text-danger">
          {t("todos.loadMoreFailed")}
        </Text>
      ) : null}
      {older.needsConnection ? (
        <Text className="text-sm text-ds-text-subtle">{t("sync.older.offline")}</Text>
      ) : (
        <Button appearance="subtle" disabled={older.loading} onPress={() => void older.load()}>
          {t(older.loading ? "todos.loading" : "todos.loadMore")}
        </Button>
      )}
    </View>
  ) : null;

  if (items.length === 0 && !older.hasOlder) {
    return <Text className="text-sm text-ds-text-subtle">{t("todos.empty")}</Text>;
  }

  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={(item) => item.id}
      ListFooterComponent={footer}
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
