import { ConfigFormModal, type SimpleFieldConfig, type SimpleFormValues } from "@repo/ui";
import { useMemo, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import type { TodoDraft } from "../todos.type";

interface TodoCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: TodoDraft) => Promise<void>;
}

export function TodoCreateDialog({ isOpen, onClose, onSubmit }: TodoCreateDialogProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo<SimpleFieldConfig[]>(
    () => [
      {
        label: t("todos.form.titlePlaceholder"),
        name: "title",
        required: true,
        type: "text"
      },
      {
        label: t("todos.form.descriptionPlaceholder"),
        name: "description",
        type: "textarea"
      }
    ],
    [t]
  );

  return (
    <ConfigFormModal
      cancelLabel={t("button.cancel")}
      defaultValues={{
        description: "",
        title: ""
      }}
      fields={fields}
      formError={error}
      isSubmitting={isSubmitting}
      open={isOpen}
      submitLabel={t("todos.create")}
      title={t("todos.create")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={async (values: SimpleFormValues) => {
        const title = typeof values.title === "string" ? values.title : "";
        const description = typeof values.description === "string" ? values.description : "";

        try {
          setIsSubmitting(true);
          setError(null);
          await onSubmit({
            description,
            title
          });
          onClose();
        } catch {
          setError(t("error.generic"));
        } finally {
          setIsSubmitting(false);
        }
      }}
    />
  );
}
