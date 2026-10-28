import type { Permission } from "@repo/auth/permissions";
import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { QueryError, SettingsSection } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { OrganizationInvitations } from "./components/organization-invitations";
import { OrganizationInviteForm } from "./components/organization-invite-form";
import { OrganizationMemberList } from "./components/organization-member-list";
import { OrganizationRoles } from "./components/organization-roles";
import { OrganizationSettings } from "./components/organization-settings";
import { useCustomRoles, useOrganizationSettingsAccess } from "./organizations.hook";
import { LoadingRows } from "../../components/loading-rows";
import { useAuth } from "../../hooks/use-auth";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { listOrganizationMembersRequest } from "../../lib/auth-api";
import { DataExportSection } from "../data-export/components/data-export-section";
import { PublicAssetUpload } from "../public-assets/components/public-asset-upload";

/** Shows a tab only with its Permission; a tab opened without it goes to General. */
function RequirePermission({
  children,
  permission
}: {
  children: ReactNode;
  permission: Permission;
}) {
  const { t } = useTranslation();
  const { permissions } = useOrganizationSettingsAccess();

  if (!permissions) {
    return <LoadingRows label={t("common.loading")} />;
  }

  return permissions.has(permission) ? children : <Navigate replace to="/organization/general" />;
}

/** The name, the logo, and leaving or deleting the Active Organization. */
export function OrganizationGeneralTab() {
  const { activeOrganization, can, permissions } = useOrganizationSettingsAccess();

  return (
    <>
      {can("logo:update") ? (
        <PublicAssetUpload kind="organization_logo" ownerName={activeOrganization?.name ?? ""} />
      ) : null}
      {activeOrganization && permissions ? (
        <OrganizationSettings
          key={activeOrganization.id}
          canDelete={can("organization:delete")}
          canRename={can("organization:update")}
          organization={activeOrganization}
        />
      ) : null}
    </>
  );
}

/** The invite form, the pending Invitations, and the Members of the Active Organization. */
export function OrganizationMembersTab() {
  const { t } = useTranslation();
  const { isLoading: isOrganizationLoading } = useOrganization();
  const { session } = useAuth();
  const { activeOrganizationId, can, permissions } = useOrganizationSettingsAccess();
  const membersQuery = useQuery({
    queryKey: createActiveOrganizationQueryKey(
      queryKeys.organizationMembersScope(),
      activeOrganizationId
    ),
    queryFn: listOrganizationMembersRequest,
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });
  const members = membersQuery.data?.members ?? [];
  const customRoleNames = (useCustomRoles(can("ac:read")).data ?? []).map((role) => role.name);

  return (
    <>
      {can("invitation:create") ? (
        <OrganizationInviteForm customRoleNames={customRoleNames} />
      ) : null}
      {can("invitation:read") ? (
        <OrganizationInvitations canRevoke={can("invitation:cancel")} />
      ) : null}
      <SettingsSection
        description={t("organizations.members.description")}
        title={t("organizations.members.title")}
      >
        {membersQuery.status === "pending" || isOrganizationLoading ? (
          <LoadingRows label={t("organizations.members.loading")} />
        ) : null}
        {membersQuery.status === "error" ? (
          <QueryError
            message={t("organizations.members.error")}
            retryLabel={t("common.retry")}
            onRetry={() => void membersQuery.refetch()}
          />
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
      </SettingsSection>
    </>
  );
}

/** The Active Organization's Custom Roles. */
export function OrganizationRolesTab() {
  return (
    <RequirePermission permission="ac:create">
      <OrganizationRoles />
    </RequirePermission>
  );
}

/** The export of the Active Organization's data. */
export function OrganizationDataTab() {
  const { activeOrganizationId } = useOrganizationSettingsAccess();

  return (
    <RequirePermission permission="organization:export">
      <DataExportSection kind="organization" organizationId={activeOrganizationId} />
    </RequirePermission>
  );
}
