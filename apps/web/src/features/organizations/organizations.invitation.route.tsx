import { AuthRequestError, getAuthErrorMessageKey } from "@repo/auth/transport";
import { AuthLayout, Button, FieldError } from "@repo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/use-auth";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { organizationApi } from "../../lib/auth-api";
import { AUTH_DEFINITION } from "../auth/auth.definition";

const WRONG_RECIPIENT = "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";

/**
 * Where an invited person accepts or declines an Invitation. Signed-out
 * visitors sign in or sign up first and come back here.
 */
export function OrganizationInvitationRoute() {
  const { invitationId = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoading, session } = useAuth();
  const { applyOrganizationSession } = useOrganization();
  const invitationQuery = useQuery({
    queryKey: ["invitations", invitationId, session?.user.id ?? null],
    queryFn: () => organizationApi.getInvitation(invitationId),
    enabled: Boolean(session),
    retry: false
  });
  const accept = useMutation({
    mutationFn: () => organizationApi.acceptInvitation(invitationId),
    // The accepted Organization is now the session's Active Organization.
    onSuccess: async (nextSession) => {
      await applyOrganizationSession(nextSession);
      void navigate("/dashboard");
    }
  });
  const decline = useMutation({
    mutationFn: () => organizationApi.rejectInvitation(invitationId),
    onSuccess: () => void navigate("/dashboard")
  });

  if (isLoading) {
    return <AuthLayout subtitle={t("common.loadingSession")} title={t("common.loading")} />;
  }

  if (!session) {
    const returnPath = `/invitations/${encodeURIComponent(invitationId)}`;
    const search = new URLSearchParams({ [AUTH_DEFINITION.returnPathParam]: returnPath });
    return <Navigate replace to={`/auth?${search.toString()}`} />;
  }

  const invitation = invitationQuery.data;
  const actionError = accept.error ?? decline.error;
  const loadError =
    invitationQuery.error instanceof AuthRequestError &&
    invitationQuery.error.code === WRONG_RECIPIENT
      ? t("organizations.invitation.wrongEmail")
      : t("organizations.invitation.notFound");

  return (
    <AuthLayout
      subtitle={invitation ? t("organizations.invitation.subtitle") : ""}
      title={invitation?.organizationName ?? t("organizations.invitation.title")}
    >
      {invitationQuery.status === "pending" ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">{t("common.loadingShort")}</p>
      ) : null}
      {invitationQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {loadError}
        </p>
      ) : null}
      {invitation ? (
        <div className="grid gap-[var(--ds-space-150)]">
          <dl className="grid gap-[var(--ds-space-050)]">
            <dt className="text-body-sm text-[color:var(--ds-text-subtle)]">
              {t("organizations.role.label")}
            </dt>
            <dd className="text-body text-[color:var(--ds-text)]">
              {t(`organizations.role.${invitation.role}`)}
            </dd>
          </dl>
          {actionError ? <FieldError>{t(getAuthErrorMessageKey(actionError))}</FieldError> : null}
          <div className="grid grid-cols-2 gap-[var(--ds-space-100)]">
            <Button
              disabled={accept.isPending || decline.isPending}
              onClick={() => accept.mutate()}
            >
              {t("organizations.invitation.accept")}
            </Button>
            <Button
              appearance="subtle"
              disabled={accept.isPending || decline.isPending}
              onClick={() => decline.mutate()}
            >
              {t("organizations.invitation.decline")}
            </Button>
          </div>
        </div>
      ) : null}
      {invitationQuery.status === "error" ? (
        <Button appearance="link" asChild className="mt-[var(--ds-space-150)]">
          <Link to="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      ) : null}
    </AuthLayout>
  );
}
