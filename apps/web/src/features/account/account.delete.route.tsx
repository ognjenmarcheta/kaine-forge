import { AuthLayout, Button, FieldError } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";

import { getAccountErrorMessage } from "./account.util";
import { useAuth } from "../../hooks/use-auth";
import { useSignOut } from "../../hooks/use-sync";
import { useTranslation } from "../../hooks/use-translation";
import { accountApi } from "../../lib/auth-api";
import { AUTH_DEFINITION } from "../auth/auth.definition";

/**
 * Opened from the deletion email. Signed-out visitors sign in first and come
 * back with the token.
 */
export function AccountDeleteRoute() {
  const { t } = useTranslation();
  const { isLoading, session } = useAuth();
  const location = useLocation();
  const [deleted, setDeleted] = useState(false);

  // The account is gone: sign-in must not return to a used token.
  if (deleted) {
    return <Navigate replace to="/auth" />;
  }

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (!session) {
    const search = new URLSearchParams({
      [AUTH_DEFINITION.returnPathParam]: `${location.pathname}${location.search}`
    });
    return <Navigate replace to={`/auth?${search.toString()}`} />;
  }

  return <AccountDeleteConfirm onDeleted={() => setDeleted(true)} />;
}

/** Deletes the account with the emailed token once the user confirms. */
function AccountDeleteConfirm({ onDeleted }: { onDeleted: () => void }) {
  const { t } = useTranslation();
  // Also deletes this device's sync data: the account and its changes are gone.
  const signOut = useSignOut();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const confirm = useMutation({
    mutationFn: accountApi.confirmDeletion,
    onSuccess: async () => {
      onDeleted();
      // The server already ended every session; this clears the local state.
      await signOut().catch(() => undefined);
    }
  });

  return (
    <AuthLayout
      subtitle={t("auth.account.delete.confirmDescription")}
      title={t("auth.account.delete.confirmTitle")}
    >
      <div className="grid gap-ds-150">
        {token ? null : <FieldError>{t("auth.account.delete.missingToken")}</FieldError>}
        {confirm.error ? <FieldError>{getAccountErrorMessage(t, confirm.error)}</FieldError> : null}
        <div className="grid grid-cols-2 gap-ds-100">
          <Button
            appearance="danger"
            disabled={!token || confirm.isPending}
            onClick={() => {
              if (token) confirm.mutate(token);
            }}
          >
            {t("auth.account.delete.confirm")}
          </Button>
          <Button appearance="subtle" asChild>
            <Link to="/account">{t("button.cancel")}</Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
