import { Button, Field, FieldDescription, FieldLabel, Input } from "@repo/ui";
import { useId, useState } from "react";

import { useTranslation } from "../hooks/use-translation";

/** A secret shown once, with a copy button; the API never returns it again. */
export function OneTimeSecret({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const id = useId();
  const [copied, setCopied] = useState(false);

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-[var(--ds-space-100)]">
        <Input id={id} readOnly value={value} className="font-mono" />
        <Button
          appearance="subtle"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? t("organizations.integrations.copied") : t("organizations.integrations.copy")}
        </Button>
      </div>
      <FieldDescription role="status">{t("organizations.integrations.shownOnce")}</FieldDescription>
    </Field>
  );
}
