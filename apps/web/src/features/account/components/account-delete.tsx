import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldDescription,
  FieldError
} from "@repo/ui";
import { useMutation } from "@tanstack/react-query";

import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { getAccountErrorMessage } from "../account.util";

/** Requests the account deletion; the emailed link opens /account/delete to confirm it. */
export function AccountDelete() {
  const { t } = useTranslation();
  const request = useMutation({ mutationFn: accountApi.requestDeletion });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.account.delete.title")}</CardTitle>
        <CardDescription>{t("auth.account.delete.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-150)]">
        {request.error ? <FieldError>{getAccountErrorMessage(t, request.error)}</FieldError> : null}
        {request.isSuccess ? (
          <FieldDescription role="status">{t("auth.account.delete.sent")}</FieldDescription>
        ) : null}
        <div>
          <Button appearance="danger" disabled={request.isPending} onClick={() => request.mutate()}>
            {t("auth.account.delete.request")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
