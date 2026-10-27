import { validateAuthName } from "@repo/auth/form";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useAuth } from "../../../hooks/use-auth";
import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { PublicAssetUpload } from "../../public-assets/components/public-asset-upload";
import { getAccountErrorMessage } from "../account.util";

/** The avatar and the display name; the sidebar shows a new name at once. */
export function AccountProfile() {
  const { t } = useTranslation();
  const { refreshSession, session } = useAuth();
  const nameId = useId();
  const [name, setName] = useState(session?.user.name ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: accountApi.updateName,
    onSuccess: () => refreshSession()
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.account.profile.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-300)]">
        <PublicAssetUpload kind="avatar" ownerName={session?.user.name ?? ""} />
        <form
          className="grid gap-[var(--ds-space-100)]"
          onSubmit={(event) => {
            event.preventDefault();
            const error = validateAuthName(name);
            setValidationError(error ? t(error) : null);

            if (!error) {
              save.mutate(name.trim());
            }
          }}
        >
          <Field>
            <FieldLabel htmlFor={nameId}>{t("auth.account.profile.nameLabel")}</FieldLabel>
            <Input
              id={nameId}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {validationError ? <FieldError>{validationError}</FieldError> : null}
          {save.error ? <FieldError>{getAccountErrorMessage(t, save.error)}</FieldError> : null}
          {save.isSuccess ? (
            <FieldDescription role="status">{t("auth.account.profile.saved")}</FieldDescription>
          ) : null}
          <div>
            <Button disabled={save.isPending} type="submit">
              {t("auth.account.profile.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
