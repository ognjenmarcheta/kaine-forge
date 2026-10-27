import { hasRoleAtLeast, ORGANIZATION_ROLES, type OrganizationRole } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { Button } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { OrganizationInvitations } from "./components/organization-invitations";
import { OrganizationInviteForm } from "./components/organization-invite-form";
import { OrganizationMemberList } from "./components/organization-member-list";
import { OrganizationSettings } from "./components/organization-settings";
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
  const ownMemberRole = members.find((member) => member.userId === session?.user.id)?.role;
  // SAFETY: member roles come from the better-auth organization plugin's
  // ORGANIZATION_ROLES vocabulary, and hasRoleAtLeast fails closed for any other
  // string. The API enforces the same rules; this only hides controls.
  const ownRole = ownMemberRole === undefined ? null : (ownMemberRole as OrganizationRole);
  const isManager = ownRole !== null && hasRoleAtLeast(ownRole, ORGANIZATION_ROLES.ADMIN);
  const activeOrganization = organizations.find(
    (organization) => organization.id === activeOrganizationId
  );
  // Organization UI stays hidden until the API's flags arrive; redirect only
  // once they say it is hidden.
  if (!organizationsVisible) {
    return isOrganizationLoading ? (
      <LoadingRows label={t("organizations.members.loading")} />
    ) : (
      <Navigate replace to="/dashboard" />
    );
  }

  return (
    <section className="grid gap-[var(--ds-space-300)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.members.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.description")}
        </p>
      </header>

      {isManager ? (
        <PublicAssetUpload kind="organization_logo" ownerName={activeOrganization?.name ?? ""} />
      ) : null}

      {isManager ? <OrganizationInviteForm /> : null}
      {isManager ? <OrganizationInvitations /> : null}

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
        <OrganizationMemberList members={members} ownRole={ownRole} ownUserId={session?.user.id} />
      ) : null}

      {activeOrganization && ownRole ? (
        <OrganizationSettings
          key={activeOrganization.id}
          canDelete={ownRole === ORGANIZATION_ROLES.OWNER}
          canRename={isManager}
          organization={activeOrganization}
        />
      ) : null}
    </section>
  );
}
