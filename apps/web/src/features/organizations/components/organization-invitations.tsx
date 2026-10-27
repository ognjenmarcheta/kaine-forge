import { getAuthErrorMessageKey } from "@repo/auth/transport";
import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, FieldError } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { organizationApi } from "../../../lib/auth-api";
import { ORGANIZATIONS_DEFINITION } from "../organizations.definition";

/** Pending Invitations of the Active Organization, which an owner or admin can revoke. */
export function OrganizationInvitations() {
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
  const revoke = useMutation({
    mutationFn: organizationApi.cancelInvitation,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_DEFINITION.invitationsScope })
  });
  const invitations = invitationsQuery.data ?? [];

  return (
    <section className="grid gap-[var(--ds-space-100)]">
      <h2 className="text-heading-sm font-semibold text-[color:var(--ds-text)]">
        {t("organizations.invitations.title")}
      </h2>
      {invitationsQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.invitations.error")}
        </p>
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
                  <span>{t(`organizations.role.${invitation.role}`)}</span>
                  <span>
                    {t("organizations.invitations.expires")}{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString(language)}
                  </span>
                </p>
              </div>
              <Button
                appearance="subtle"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation.id)}
              >
                {t("organizations.invitations.revoke")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
