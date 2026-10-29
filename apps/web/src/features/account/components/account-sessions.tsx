import { Badge, Button, ConfirmModal, FieldError, QueryError, SettingsSection } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { ACCOUNT_QUERY_KEYS } from "../account.definition";
import { getAccountErrorMessage } from "../account.util";

/** The sign-out that waits for a confirm: one other device, or every other device. */
type PendingSignOut = { kind: "one"; sessionId: string; device: string } | { kind: "others" };

/** The signed-in devices of the user; signs out one other device or all of them. */
export function AccountSessions() {
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingSignOut | null>(null);
  const sessions = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.sessions,
    queryFn: accountApi.listSessions
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.sessions });
  const signOut = useMutation({
    mutationFn: (action: PendingSignOut) =>
      action.kind === "one"
        ? accountApi.revokeSession(action.sessionId)
        : accountApi.revokeOtherSessions(),
    onSuccess: (_result, action) =>
      toast.success(
        t(
          action.kind === "one"
            ? "auth.account.sessions.revoked"
            : "auth.account.sessions.othersRevoked"
        )
      ),
    onSettled: async () => {
      setPending(null);
      await refresh();
    }
  });
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  const hasOtherSessions = (sessions.data ?? []).some((session) => !session.current);

  return (
    <SettingsSection
      description={t("auth.account.sessions.description")}
      title={t("auth.account.sessions.title")}
    >
      {sessions.status === "pending" ? (
        <LoadingRows label={t("auth.account.sessions.loading")} />
      ) : null}
      {sessions.status === "error" ? (
        <QueryError
          message={t("auth.account.sessions.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void sessions.refetch()}
        />
      ) : null}
      {sessions.data ? (
        <ul aria-label={t("auth.account.sessions.title")} className="ui-work-list">
          {sessions.data.map((session) => {
            const device = session.userAgent ?? t("auth.account.sessions.unknownDevice");

            return (
              <li
                key={session.id}
                className="ui-work-row flex flex-wrap items-center justify-between gap-ds-150"
              >
                <div className="grid min-w-0 gap-ds-050">
                  <p className="flex flex-wrap items-center gap-ds-100 break-all text-body text-ds-text">
                    {device}
                    {session.current ? (
                      <Badge appearance="success">{t("auth.account.sessions.thisDevice")}</Badge>
                    ) : null}
                  </p>
                  <p className="text-body-sm text-ds-text-subtle">
                    {t("auth.account.sessions.details")
                      .replace("{ip}", session.ipAddress ?? t("auth.account.sessions.unknownIp"))
                      .replace("{date}", date.format(new Date(session.createdAt)))}
                  </p>
                </div>
                {session.current ? null : (
                  <Button
                    appearance="subtle"
                    disabled={signOut.isPending}
                    onClick={() => setPending({ device, kind: "one", sessionId: session.id })}
                  >
                    {t("auth.account.sessions.revoke")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {signOut.error ? <FieldError>{getAccountErrorMessage(t, signOut.error)}</FieldError> : null}
      {hasOtherSessions ? (
        <div>
          <Button
            appearance="secondary"
            disabled={signOut.isPending}
            onClick={() => setPending({ kind: "others" })}
          >
            {t("auth.account.sessions.revokeOthers")}
          </Button>
        </div>
      ) : null}
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t(
          pending?.kind === "others"
            ? "auth.account.sessions.revokeOthers"
            : "auth.account.sessions.revoke"
        )}
        description={t(
          pending?.kind === "others"
            ? "auth.account.sessions.revokeOthersDescription"
            : "auth.account.sessions.revokeDescription"
        )}
        isConfirming={signOut.isPending}
        open={pending !== null}
        title={pending?.kind === "one" ? pending.device : t("auth.account.sessions.revokeOthers")}
        onConfirm={() => {
          if (pending) signOut.mutate(pending);
        }}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />
    </SettingsSection>
  );
}
