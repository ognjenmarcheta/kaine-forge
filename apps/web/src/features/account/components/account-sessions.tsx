import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";
import { accountApi } from "../../../lib/auth-api";
import { ACCOUNT_QUERY_KEYS } from "../account.definition";
import { getAccountErrorMessage } from "../account.util";

/** The signed-in devices of the user; signs out one other device or all of them. */
export function AccountSessions() {
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.sessions,
    queryFn: accountApi.listSessions
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.sessions });
  const revoke = useMutation({ mutationFn: accountApi.revokeSession, onSuccess: refresh });
  const revokeOthers = useMutation({
    mutationFn: accountApi.revokeOtherSessions,
    onSuccess: refresh
  });
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" });
  const hasOtherSessions = (sessions.data ?? []).some((session) => !session.current);
  const error = revoke.error ?? revokeOthers.error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.account.sessions.title")}</CardTitle>
        <CardDescription>{t("auth.account.sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-[var(--ds-space-150)]">
        {sessions.status === "pending" ? (
          <LoadingRows label={t("auth.account.sessions.loading")} />
        ) : null}
        {sessions.status === "error" ? (
          <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
            {t("auth.account.sessions.error")}
          </p>
        ) : null}
        {sessions.data ? (
          <ul
            aria-label={t("auth.account.sessions.title")}
            className="grid gap-[var(--ds-space-100)]"
          >
            {sessions.data.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-[var(--ds-space-100)] rounded-[var(--ds-radius-100)] border border-[var(--ds-border)] p-[var(--ds-space-150)]"
              >
                <div className="grid min-w-0 gap-[var(--ds-space-050)]">
                  <p className="flex flex-wrap items-center gap-[var(--ds-space-100)] break-all text-body text-[color:var(--ds-text)]">
                    {session.userAgent ?? t("auth.account.sessions.unknownDevice")}
                    {session.current ? (
                      <Badge appearance="success">{t("auth.account.sessions.thisDevice")}</Badge>
                    ) : null}
                  </p>
                  <p className="text-body-sm text-[color:var(--ds-text-subtle)]">
                    {t("auth.account.sessions.details")
                      .replace("{ip}", session.ipAddress ?? t("auth.account.sessions.unknownIp"))
                      .replace("{date}", date.format(new Date(session.createdAt)))}
                  </p>
                </div>
                {session.current ? null : (
                  <Button
                    appearance="subtle"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    {t("auth.account.sessions.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <FieldError>{getAccountErrorMessage(t, error)}</FieldError> : null}
        {hasOtherSessions ? (
          <div>
            <Button
              appearance="secondary"
              disabled={revokeOthers.isPending}
              onClick={() => revokeOthers.mutate()}
            >
              {t("auth.account.sessions.revokeOthers")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
