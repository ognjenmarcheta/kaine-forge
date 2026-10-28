import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { Button, Field, FieldError, FieldLabel, Input } from "@repo/ui";
import { useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";

interface PasswordConfirmFormProps {
  id: string;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

/** Asks for the account password before a sensitive two-factor change. */
export function PasswordConfirmForm({ id, onCancel, onConfirm }: PasswordConfirmFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="grid gap-ds-150"
      onSubmit={(event) => {
        event.preventDefault();

        if (!password) {
          setError(t("auth.form.error.passwordRequired"));
          return;
        }

        setError(null);
        setIsSubmitting(true);
        onConfirm(password)
          .catch((confirmError: unknown) => setError(t(getAuthErrorMessageKey(confirmError))))
          .finally(() => setIsSubmitting(false));
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>{t("auth.security.passwordPrompt")}</FieldLabel>
        <Input
          id={id}
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex gap-ds-100">
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? t("common.loadingShort") : t("auth.security.continue")}
        </Button>
        <Button appearance="subtle" type="button" onClick={onCancel}>
          {t("auth.security.cancel")}
        </Button>
      </div>
    </form>
  );
}
