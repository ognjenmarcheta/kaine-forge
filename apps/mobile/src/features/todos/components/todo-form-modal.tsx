import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogOverlay,
  DialogTitle,
  Input
} from "@repo/mobile-ui";
import { useEffect, useState } from "react";
import { View } from "react-native";

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
    <Dialog animationType="slide" isOpen={isOpen} onClose={onClose}>
      <DialogOverlay className="justify-end px-0">
        <DialogContent position="bottom">
          <DialogTitle>{title}</DialogTitle>

          <View className="mt-3 gap-3">
            <Input
              placeholder={t("todos.form.titlePlaceholder")}
              value={draft.title}
              onChangeText={(value) => {
                setDraft((current) => ({ ...current, title: value }));
              }}
            />
            <Input
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

          <DialogFooter>
            <Button appearance="secondary" spacing="compact" onPress={onClose}>
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
        </DialogContent>
      </DialogOverlay>
    </Dialog>
  );
}
