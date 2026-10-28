import { Button, ConfirmModal, FieldDescription, FieldError, SettingsSection } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { getAccountErrorMessage } from "../account.util";

/** Requests the account deletion; the emailed link opens /account/delete to confirm it. */
export function AccountDelete() {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const request = useMutation({
    mutationFn: accountApi.requestDeletion,
    onSuccess: () => toast.success(t("auth.account.delete.requested")),
    onSettled: () => setConfirming(false)
  });

  return (
    <SettingsSection
      description={t("auth.account.delete.description")}
      title={t("auth.account.delete.title")}
    >
      {request.error ? <FieldError>{getAccountErrorMessage(t, request.error)}</FieldError> : null}
      {request.isSuccess ? (
        <FieldDescription role="status">{t("auth.account.delete.sent")}</FieldDescription>
      ) : null}
      <div>
        <Button
          appearance="danger"
          disabled={request.isPending}
          onClick={() => setConfirming(true)}
        >
          {t("auth.account.delete.request")}
        </Button>
      </div>
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("auth.account.delete.requestConfirm")}
        description={t("auth.account.delete.requestDescription")}
        isConfirming={request.isPending}
        open={confirming}
        title={t("auth.account.delete.title")}
        onConfirm={() => request.mutate()}
        onOpenChange={setConfirming}
      />
    </SettingsSection>
  );
}
