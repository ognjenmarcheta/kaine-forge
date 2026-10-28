import { validateAuthEmail } from "@repo/auth/form";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SettingsSection
} from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { getAccountErrorMessage } from "../account.util";

/** Requests an email change; the address changes only after the emailed link is used. */
export function AccountEmail() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const emailId = useId();
  const [newEmail, setNewEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const change = useMutation({ mutationFn: accountApi.changeEmail });

  return (
    <SettingsSection
      description={t("auth.account.email.current").replace("{email}", session?.user.email ?? "")}
      title={t("auth.account.email.title")}
    >
      <form
        className="grid gap-[var(--ds-space-100)]"
        onSubmit={(event) => {
          event.preventDefault();
          const error = validateAuthEmail(newEmail);
          setValidationError(error ? t(error) : null);

          if (!error) {
            change.mutate(newEmail.trim());
          }
        }}
      >
        <Field>
          <FieldLabel htmlFor={emailId}>{t("auth.account.email.newLabel")}</FieldLabel>
          <Input
            id={emailId}
            autoComplete="email"
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
        </Field>
        {validationError ? <FieldError>{validationError}</FieldError> : null}
        {change.error ? <FieldError>{getAccountErrorMessage(t, change.error)}</FieldError> : null}
        {change.isSuccess ? (
          <FieldDescription role="status">{t("auth.account.email.sent")}</FieldDescription>
        ) : null}
        <div>
          <Button disabled={change.isPending} type="submit">
            {t("auth.account.email.submit")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
