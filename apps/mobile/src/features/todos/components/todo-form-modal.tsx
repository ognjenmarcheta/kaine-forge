import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoDraft } from "../todos.type";

interface TodoFormModalProps {
  initialDraft: TodoDraft;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: TodoDraft) => Promise<void>;
  title: string;
}

export function TodoFormModal({
  initialDraft,
  isOpen,
  onClose,
  onSubmit,
  title
}: TodoFormModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TodoDraft>(initialDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialDraft);
    }
  }, [initialDraft, isOpen]);

  async function submit() {
    if (!draft.title.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(draft);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal animationType="slide" transparent visible={isOpen}>
      <View className="flex-1 justify-end bg-ds-blanket">
        <View className="rounded-t-2xl bg-ds-surface p-4">
          <Text className="text-lg font-semibold text-ds-text">{title}</Text>

          <View className="mt-3 gap-3">
            <TextInput
              className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
              placeholder={t("todos.form.titlePlaceholder")}
              placeholderTextColor="var(--ds-text-subtlest)"
              value={draft.title}
              onChangeText={(value) => {
                setDraft((current) => ({ ...current, title: value }));
              }}
            />
            <TextInput
              className="rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-ds-text"
              multiline
              numberOfLines={3}
              placeholder={t("todos.form.descriptionPlaceholder")}
              placeholderTextColor="var(--ds-text-subtlest)"
              textAlignVertical="top"
              value={draft.description}
              onChangeText={(value) => {
                setDraft((current) => ({ ...current, description: value }));
              }}
            />
          </View>

          <View className="mt-4 flex-row justify-end gap-2">
            <Pressable className="rounded-md border border-ds-border px-3 py-2" onPress={onClose}>
              <Text className="text-sm text-ds-text">{t("button.cancel")}</Text>
            </Pressable>
            <Pressable
              className="rounded-md bg-ds-bg-brand-bold px-3 py-2"
              disabled={isSubmitting}
              onPress={() => {
                void submit();
              }}
            >
              <Text className="text-sm text-ds-text-inverse">
                {isSubmitting ? t("common.loadingShort") : t("button.save")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
