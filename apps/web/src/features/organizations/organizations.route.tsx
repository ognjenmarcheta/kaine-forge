import type { Permission } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { Button } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { OrganizationInvitations } from "./components/organization-invitations";
import { OrganizationInviteForm } from "./components/organization-invite-form";
import { OrganizationMemberList } from "./components/organization-member-list";
import { OrganizationRoles } from "./components/organization-roles";
import { OrganizationSettings } from "./components/organization-settings";
import { useCustomRoles, useOrganizationPermissions } from "./organizations.hook";
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
  // The API answers with the session's Permissions and enforces each one;
  // these only decide which controls show.
  const permissions = useOrganizationPermissions(
    organizationsVisible ? activeOrganizationId : null
  );
  const can = (permission: Permission) => permissions?.has(permission) === true;
  const customRoleNames = (useCustomRoles(can("ac:read")).data ?? []).map((role) => role.name);
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

      {can("logo:update") ? (
        <PublicAssetUpload kind="organization_logo" ownerName={activeOrganization?.name ?? ""} />
      ) : null}

      {can("invitation:create") ? (
        <OrganizationInviteForm customRoleNames={customRoleNames} />
      ) : null}
      {can("invitation:read") ? (
        <OrganizationInvitations canRevoke={can("invitation:cancel")} />
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
        <OrganizationMemberList
          customRoleNames={customRoleNames}
          members={members}
          ownUserId={session?.user.id}
          permissions={permissions ?? new Set()}
        />
      ) : null}

      {can("ac:create") ? <OrganizationRoles /> : null}

      {activeOrganization && permissions ? (
        <OrganizationSettings
          key={activeOrganization.id}
          canDelete={can("organization:delete")}
          canRename={can("organization:update")}
          organization={activeOrganization}
        />
      ) : null}
    </section>
  );
}
