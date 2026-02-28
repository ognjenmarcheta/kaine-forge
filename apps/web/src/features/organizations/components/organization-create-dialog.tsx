import { ConfigFormModal, type SimpleFieldConfig, type SimpleFormValues } from "@repo/ui";
import { useMemo, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";

interface OrganizationCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export function OrganizationCreateDialog({
  isOpen,
  onClose,
  onSubmit
}: OrganizationCreateDialogProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fields = useMemo<SimpleFieldConfig[]>(
    () => [
      {
        label: t("organizations.name"),
        name: "name",
        required: true,
        type: "text"
      }
    ],
    [t]
  );

  return (
    <ConfigFormModal
      cancelLabel={t("button.cancel")}
      defaultValues={{
        name: ""
      }}
      fields={fields}
      formError={error}
      isSubmitting={isSubmitting}
      open={isOpen}
      submitLabel={t("button.save")}
      title={t("organizations.create")}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
      onSubmit={async (values: SimpleFormValues) => {
        const name = typeof values.name === "string" ? values.name : "";

        setError(null);
        setIsSubmitting(true);

        try {
          await onSubmit(name.trim());
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
