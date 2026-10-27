import { getAuthErrorMessageKey } from "@repo/auth/transport";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";
import { passkeyApi } from "../../../lib/auth-api";
import { isPasskeySupported } from "../../auth/auth.util";
import { SECURITY_DEFINITION } from "../security.definition";

/** Lists, adds, and deletes the signed-in user's passkeys. */
export function PasskeySettings() {
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const passkeys = useQuery({
    queryKey: SECURITY_DEFINITION.queryKeys.passkeys,
    queryFn: passkeyApi.list
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: SECURITY_DEFINITION.queryKeys.passkeys });
  const add = useMutation({
    mutationFn: passkeyApi.add,
    onSuccess: async () => {
      setName("");
      await refresh();
    }
  });
  const remove = useMutation({ mutationFn: passkeyApi.delete, onSuccess: refresh });
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium" });
  const error = add.error ?? remove.error;
  const canAdd = isPasskeySupported();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.passkeys.title")}</CardTitle>
        <CardDescription>{t("auth.passkeys.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-150)]">
        {passkeys.status === "pending" ? <LoadingRows label={t("auth.passkeys.loading")} /> : null}
        {passkeys.status === "error" ? (
          <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
            {t("auth.passkeys.error")}
          </p>
        ) : null}
        {passkeys.data?.length === 0 ? (
          <p className="text-body text-[color:var(--ds-text-subtle)]">{t("auth.passkeys.empty")}</p>
        ) : null}
        {passkeys.data && passkeys.data.length > 0 ? (
          <ul aria-label={t("auth.passkeys.title")} className="grid gap-[var(--ds-space-100)]">
            {passkeys.data.map((passkey) => {
              const label = passkey.name ?? t("auth.passkeys.unnamed");

              return (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-[var(--ds-space-100)] rounded-[var(--ds-radius-100)] border border-[var(--ds-border)] p-[var(--ds-space-150)]"
                >
                  <div className="grid min-w-0 gap-[var(--ds-space-050)]">
                    <p className="break-all text-body text-[color:var(--ds-text)]">{label}</p>
                    <p className="text-body-sm text-[color:var(--ds-text-subtle)]">
                      {t("auth.passkeys.added").replace(
                        "{date}",
                        date.format(new Date(passkey.createdAt))
                      )}
                    </p>
                  </div>
                  <Button
                    appearance="subtle"
                    aria-label={t("auth.passkeys.deleteLabel").replace("{name}", label)}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(passkey.id)}
                  >
                    {t("auth.passkeys.delete")}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? <FieldError>{t(getAuthErrorMessageKey(error))}</FieldError> : null}
        {canAdd ? (
          <form
            className="grid gap-[var(--ds-space-150)]"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmedName = name.trim();

              if (!trimmedName) {
                setNameError(t("auth.passkeys.nameRequired"));
                return;
              }

              setNameError(null);
              add.mutate(trimmedName);
            }}
          >
            <Field>
              <FieldLabel htmlFor="passkey-name">{t("auth.passkeys.nameLabel")}</FieldLabel>
              <Input
                id="passkey-name"
                maxLength={SECURITY_DEFINITION.passkeyNameMaxLength}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
            <div>
              <Button disabled={add.isPending} type="submit">
                {add.isPending ? t("common.loadingShort") : t("auth.passkeys.add")}
              </Button>
            </div>
          </form>
        ) : (
          <FieldDescription>{t("auth.passkeys.unsupported")}</FieldDescription>
        )}
      </CardContent>
    </Card>
  );
}
