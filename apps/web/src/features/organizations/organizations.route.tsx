import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { Button } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { LoadingRows } from "../../components/loading-rows";
import { useAuth } from "../../hooks/use-auth";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { listOrganizationMembersRequest } from "../../lib/auth-api";
import { PublicAssetUpload } from "../public-assets/components/public-asset-upload";

export function OrganizationsRoute() {
  const { t } = useTranslation();
  const {
    activeOrganizationId,
    isLoading: isOrganizationLoading,
    organizations,
    organizationsVisible
  } = useOrganization();
  const membersQuery = useQuery({
    queryKey: createActiveOrganizationQueryKey(
      queryKeys.organizationMembersScope(),
      activeOrganizationId
    ),
    queryFn: listOrganizationMembersRequest,
    enabled: organizationsVisible && Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const members = membersQuery.data?.members ?? [];
  const { session } = useAuth();
  const ownRole = members.find((member) => member.userId === session?.user.id)?.role;
  // SAFETY: member roles come from the better-auth organization plugin's
  // ORGANIZATION_ROLES vocabulary, and hasRoleAtLeast fails closed for any other
  // string. The API enforces the same rule; this only hides a control.
  const canEditLogo =
    ownRole !== undefined && hasRoleAtLeast(ownRole as OrganizationRole, ORGANIZATION_ROLES.ADMIN);
  if (!organizationsVisible) return <Navigate replace to="/dashboard" />;

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.members.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.description")}
        </p>
      </header>

      {canEditLogo ? (
        <PublicAssetUpload
          kind="organization_logo"
          ownerName={
            organizations.find((organization) => organization.id === activeOrganizationId)?.name ??
            ""
          }
        />
      ) : null}

      {membersQuery.status === "pending" || isOrganizationLoading ? (
        <LoadingRows label={t("organizations.members.loading")} />
      ) : null}

      {membersQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.members.error")}{" "}
          <Button appearance="subtle" onClick={() => void membersQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </p>
      ) : null}

      {membersQuery.status === "success" && members.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.empty")}
        </p>
      ) : null}

      {members.length > 0 ? (
        <div className="ui-work-list">
          {members.map((member) => (
            <article key={member.id} className="ui-work-row">
              <div className="flex flex-wrap items-start justify-between gap-[var(--ds-space-150)]">
                <div>
                  <h2 className="text-heading-xs font-semibold text-[color:var(--ds-text)]">
                    {member.name}
                  </h2>
                  <p className="text-body-sm text-[color:var(--ds-text-subtle)]">{member.email}</p>
                </div>
                <span className="rounded-[var(--ds-radius-100)] bg-[var(--ds-background-neutral)] px-[var(--ds-space-100)] py-[var(--ds-space-050)] text-body-sm text-[color:var(--ds-text-subtle)]">
                  {member.role}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
