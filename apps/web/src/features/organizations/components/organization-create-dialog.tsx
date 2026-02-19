import { Button, Input } from "@repo/ui";
import { useState, type FormEvent } from "react";

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
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(name.trim());
      setName("");
      onClose();
    } catch {
      setError(t("error.generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="web-dialog-backdrop" role="presentation">
      <section aria-label={t("navigation.organizationCreate")} className="web-dialog">
        <h2>{t("navigation.organizationCreate")}</h2>
        <form className="web-form" onSubmit={handleSubmit}>
          <label className="web-form__field">
            <span>{t("navigation.organizationName")}</span>
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {error ? <p className="web-form__error">{error}</p> : null}
          <div className="web-form__row">
            <Button intent="subtle" type="button" onClick={onClose}>
              {t("button.cancel")}
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {t("button.save")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
