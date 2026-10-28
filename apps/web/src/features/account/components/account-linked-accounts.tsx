import type { AuthSocialProvider } from "@repo/auth/transport";
import { Button, ConfirmModal, FieldError, QueryError, SettingsSection } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { ACCOUNT_QUERY_KEYS } from "../account.definition";
import { getAccountErrorMessage } from "../account.util";

const PROVIDER_LABEL_KEYS: Readonly<Record<string, string>> = {
  credential: "auth.account.accounts.provider.credential",
  github: "auth.account.accounts.provider.github",
  google: "auth.account.accounts.provider.google"
};

/** The user's sign-in methods; links a configured social provider or unlinks one. */
export function AccountLinkedAccounts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.accounts,
    queryFn: accountApi.listAccounts
  });
  const providers = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.socialProviders,
    queryFn: accountApi.listSocialProviders
  });
  // The browser leaves for the provider and comes back to /account/security.
  const link = useMutation({ mutationFn: accountApi.linkSocialAccount });
  const [confirming, setConfirming] = useState<{ id: string; providerId: string } | null>(null);
  const unlink = useMutation({
    mutationFn: accountApi.unlinkAccount,
    onSuccess: async () => {
      toast.success(t("auth.account.accounts.unlinked"));
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.accounts });
    },
    onSettled: () => setConfirming(null)
  });
  const linked = accounts.data ?? [];
  const linkable = (providers.data ?? []).filter(
    (provider: AuthSocialProvider) => !linked.some((account) => account.providerId === provider)
  );
  const label = (providerId: string) => t(PROVIDER_LABEL_KEYS[providerId] ?? providerId);
  const error = link.error ?? unlink.error;

  return (
    <SettingsSection
      description={t("auth.account.accounts.description")}
      title={t("auth.account.accounts.title")}
    >
      {accounts.status === "pending" ? (
        <LoadingRows label={t("auth.account.accounts.loading")} />
      ) : null}
      {accounts.status === "error" ? (
        <QueryError
          message={t("auth.account.accounts.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void accounts.refetch()}
        />
      ) : null}
      {linked.length > 0 ? (
        <ul aria-label={t("auth.account.accounts.title")} className="ui-work-list">
          {linked.map((account) => (
            <li
              key={account.id}
              className="ui-work-row flex flex-wrap items-center justify-between gap-[var(--ds-space-150)]"
            >
              <span className="text-body text-[color:var(--ds-text)]">
                {label(account.providerId)}
              </span>
              {/* better-auth refuses to unlink the last sign-in method. */}
              {linked.length > 1 ? (
                <Button
                  appearance="subtle"
                  disabled={unlink.isPending}
                  onClick={() => setConfirming(account)}
                >
                  {t("auth.account.accounts.unlink")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {linkable.length > 0 ? (
        <div className="flex flex-wrap gap-[var(--ds-space-100)]">
          {linkable.map((provider) => (
            <Button
              key={provider}
              appearance="secondary"
              disabled={link.isPending}
              onClick={() => link.mutate(provider)}
            >
              {t("auth.account.accounts.link").replace("{provider}", label(provider))}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? <FieldError>{getAccountErrorMessage(t, error)}</FieldError> : null}
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("auth.account.accounts.unlink")}
        description={t("auth.account.accounts.unlinkDescription")}
        isConfirming={unlink.isPending}
        open={confirming !== null}
        title={confirming ? label(confirming.providerId) : ""}
        onConfirm={() => {
          if (confirming) unlink.mutate(confirming.id);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      />
    </SettingsSection>
  );
}
