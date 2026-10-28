import type { AuthInvitation } from "@repo/auth/auth.type";
import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, ConfirmModal, FieldError, QueryError, SettingsSection } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import { ORGANIZATIONS_DEFINITION } from "../organizations.definition";
import { roleLabel } from "../organizations.util";

interface OrganizationInvitationsProps {
  canRevoke: boolean;
}

/** Pending Invitations of the Active Organization; `invitation:cancel` revokes one. */
export function OrganizationInvitations({ canRevoke }: OrganizationInvitationsProps) {
  const { language, t } = useTranslation();
  const { activeOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const invitationsQuery = useQuery({
    queryKey: createActiveOrganizationQueryKey(
      ORGANIZATIONS_DEFINITION.invitationsScope,
      activeOrganizationId
    ),
    queryFn: organizationApi.listInvitations,
    enabled: Boolean(activeOrganizationId)
  });
  const [confirming, setConfirming] = useState<AuthInvitation | null>(null);
  const revoke = useMutation({
    mutationFn: organizationApi.cancelInvitation,
    onSuccess: () => toast.success(t("organizations.invitations.revoked")),
    onSettled: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_DEFINITION.invitationsScope });
    }
  });
  const invitations = invitationsQuery.data ?? [];

  return (
    <SettingsSection title={t("organizations.invitations.title")}>
      {invitationsQuery.status === "error" ? (
        <QueryError
          message={t("organizations.invitations.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void invitationsQuery.refetch()}
        />
      ) : null}
      {invitationsQuery.status === "success" && invitations.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.invitations.empty")}
        </p>
      ) : null}
      {revoke.error ? <FieldError>{t(getAuthErrorMessageKey(revoke.error))}</FieldError> : null}
      {invitations.length > 0 ? (
        <ul aria-label={t("organizations.invitations.title")} className="ui-work-list">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="ui-work-row flex flex-wrap items-center justify-between gap-[var(--ds-space-150)]"
            >
              <div>
                <p className="text-body font-semibold text-[color:var(--ds-text)]">
                  {invitation.email}
                </p>
                <p className="flex flex-wrap gap-[var(--ds-space-100)] text-body-sm text-[color:var(--ds-text-subtle)]">
                  <span>{roleLabel(invitation.role, t)}</span>
                  <span>
                    {t("organizations.invitations.expires")}{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString(language)}
                  </span>
                </p>
              </div>
              {canRevoke ? (
                <Button
                  appearance="subtle"
                  disabled={revoke.isPending}
                  onClick={() => setConfirming(invitation)}
                >
                  {t("organizations.invitations.revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("organizations.invitations.revoke")}
        description={t("organizations.invitations.revokeDescription")}
        isConfirming={revoke.isPending}
        open={confirming !== null}
        title={confirming?.email ?? ""}
        onConfirm={() => {
          if (confirming) revoke.mutate(confirming.id);
        }}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      />
    </SettingsSection>
  );
}
