import { AuthRequestError, getAuthErrorMessageKey } from "@repo/auth/transport";
import { AuthLayout, Button, ConfirmModal, FieldError, Skeleton } from "@repo/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

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
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const decline = useMutation({
    mutationFn: () => organizationApi.rejectInvitation(invitationId),
    onSuccess: () => {
      toast.success(t("organizations.invitation.declined"));
      void navigate("/dashboard");
    },
    onError: () => setConfirmingDecline(false)
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
        <div aria-busy="true" role="status" className="grid gap-ds-150">
          <span className="sr-only">{t("common.loadingShort")}</span>
          <Skeleton className="h-ds-400 w-1/2" />
          <div className="grid grid-cols-2 gap-ds-100">
            <Skeleton className="h-ds-control-medium" />
            <Skeleton className="h-ds-control-medium" />
          </div>
        </div>
      ) : null}
      {invitationQuery.status === "error" ? (
        <p role="alert" className="text-body text-ds-text-danger">
          {loadError}
        </p>
      ) : null}
      {invitation ? (
        <div className="grid gap-ds-150">
          <dl className="grid gap-ds-050">
            <dt className="text-body-sm text-ds-text-subtle">{t("organizations.role.label")}</dt>
            <dd className="text-body text-ds-text">{t(`organizations.role.${invitation.role}`)}</dd>
          </dl>
          {actionError ? <FieldError>{t(getAuthErrorMessageKey(actionError))}</FieldError> : null}
          <div className="grid grid-cols-2 gap-ds-100">
            <Button
              disabled={accept.isPending || decline.isPending}
              onClick={() => accept.mutate()}
            >
              {t("organizations.invitation.accept")}
            </Button>
            <Button
              appearance="subtle"
              disabled={accept.isPending || decline.isPending}
              onClick={() => setConfirmingDecline(true)}
            >
              {t("organizations.invitation.decline")}
            </Button>
          </div>
          <ConfirmModal
            cancelLabel={t("button.cancel")}
            confirmLabel={t("organizations.invitation.decline")}
            description={t("organizations.invitation.declineDescription")}
            isConfirming={decline.isPending}
            open={confirmingDecline}
            title={invitation.organizationName}
            onConfirm={() => decline.mutate()}
            onOpenChange={setConfirmingDecline}
          />
        </div>
      ) : null}
      {invitationQuery.status === "error" ? (
        <Button appearance="link" asChild className="mt-ds-150">
          <Link to="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      ) : null}
    </AuthLayout>
  );
}
