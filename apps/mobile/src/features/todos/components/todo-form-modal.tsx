import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogOverlay,
  DialogTitle,
  Input,
  Text
} from "@repo/mobile-ui";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<TodoDraft>(initialDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wasOpen = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setDraft(initialDraft);
      setError(false);
    }
    wasOpen.current = isOpen;
  }, [initialDraft, isOpen]);

  async function submit() {
    if (isSubmitting || !draft.title.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(false);

    try {
      await onSubmit(draft);
      onClose();
    } catch {
      setError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      animationType="slide"
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <DialogOverlay className="justify-end px-0">
        <DialogContent position="bottom" className="max-h-full">
          <ScrollView keyboardShouldPersistTaps="handled" className="shrink">
            <DialogTitle>{title}</DialogTitle>

            <View className="mt-3 gap-3">
              <Text variant="label">{t("todos.form.titlePlaceholder")}</Text>
              <Input
                editable={!isSubmitting}
                accessibilityLabel={t("todos.form.titlePlaceholder")}
                placeholder={t("todos.form.titlePlaceholder")}
                value={draft.title}
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, title: value }));
                }}
              />
              <Text variant="label">{t("todos.form.descriptionPlaceholder")}</Text>
              <Input
                editable={!isSubmitting}
                accessibilityLabel={t("todos.form.descriptionPlaceholder")}
                className="min-h-24"
                multiline
                numberOfLines={3}
                placeholder={t("todos.form.descriptionPlaceholder")}
                textAlignVertical="top"
                value={draft.description}
                onChangeText={(value) => {
                  setDraft((current) => ({ ...current, description: value }));
                }}
              />
            </View>

            {error ? (
              <Text accessibilityRole="alert" className="text-ds-text-danger">
                {t("error.generic")}
              </Text>
            ) : null}
            <DialogFooter>
              <Button
                disabled={isSubmitting}
                appearance="secondary"
                spacing="compact"
                onPress={onClose}
              >
                {t("button.cancel")}
              </Button>
              <Button
                disabled={isSubmitting}
                spacing="compact"
                onPress={() => {
                  void submit();
                }}
              >
                {isSubmitting ? t("common.loadingShort") : t("button.save")}
              </Button>
            </DialogFooter>
            <View style={{ paddingBottom: insets.bottom }} />
          </ScrollView>
        </DialogContent>
      </DialogOverlay>
    </Dialog>
  );
}
