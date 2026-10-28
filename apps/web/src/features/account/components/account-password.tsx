import { validateAuthPasswordForSignup, validateAuthPasswordRequired } from "@repo/auth/form";
import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SettingsSection
} from "@repo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { ACCOUNT_QUERY_KEYS } from "../account.definition";
import { getAccountErrorMessage } from "../account.util";

/** Changes the password with the current one; optionally signs out every other session. */
export function AccountPassword() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const currentId = useId();
  const newId = useId();
  const revokeId = useId();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.sessions });
    }
  });

  return (
    <SettingsSection title={t("auth.account.password.title")}>
      <form
        className="grid gap-[var(--ds-space-150)]"
        onSubmit={(event) => {
          event.preventDefault();
          const error =
            validateAuthPasswordRequired(currentPassword) ??
            validateAuthPasswordForSignup(newPassword);
          setValidationError(error ? t(error) : null);

          if (!error) {
            change.mutate({ currentPassword, newPassword, revokeOtherSessions });
          }
        }}
      >
        <Field>
          <FieldLabel htmlFor={currentId}>{t("auth.account.password.currentLabel")}</FieldLabel>
          <Input
            id={currentId}
            autoComplete="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={newId}>{t("auth.account.password.newLabel")}</FieldLabel>
          <Input
            id={newId}
            autoComplete="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </Field>
        <label className="flex items-center gap-[var(--ds-space-100)]" htmlFor={revokeId}>
          <Checkbox
            checked={revokeOtherSessions}
            id={revokeId}
            onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
          />
          <span>{t("auth.account.password.revokeOthers")}</span>
        </label>
        {validationError ? <FieldError>{validationError}</FieldError> : null}
        {change.error ? <FieldError>{getAccountErrorMessage(t, change.error)}</FieldError> : null}
        {change.isSuccess ? (
          <FieldDescription role="status">{t("auth.account.password.changed")}</FieldDescription>
        ) : null}
        <div>
          <Button disabled={change.isPending} type="submit">
            {t("auth.account.password.submit")}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
