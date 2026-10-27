import { Button, FieldError } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getAccountErrorMessage } from "./account.util";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "../../hooks/use-translation";
import { accountApi } from "../../lib/auth-api";

/** Opened from the deletion email: deletes the account with the token once the user confirms. */
export function AccountDeleteRoute() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const confirm = useMutation({
    mutationFn: accountApi.confirmDeletion,
    onSuccess: async () => {
      // The server already ended every session; this clears the local state.
      await logout().catch(() => undefined);
      void navigate("/auth", { replace: true });
    }
  });

  return (
    <section className="grid gap-[var(--ds-space-300)]">
      <header>
        <h1>{t("auth.account.delete.confirmTitle")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">
          {t("auth.account.delete.confirmDescription")}
        </p>
      </header>
      {token ? null : <FieldError>{t("auth.account.delete.missingToken")}</FieldError>}
      {confirm.error ? <FieldError>{getAccountErrorMessage(t, confirm.error)}</FieldError> : null}
      <div className="flex flex-wrap gap-[var(--ds-space-100)]">
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
    </section>
  );
}
