import { PageHeader } from "@repo/ui";
import { Navigate, Outlet } from "react-router-dom";

import { useOrganizationSettingsAccess } from "./organizations.hook";
import { LoadingRows } from "../../components/loading-rows";
import { SettingsTabs } from "../../components/settings-tabs";
import { ORGANIZATION_TABS } from "../../components/shell-navigation.definition";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

/** The Organization settings page: its header, its tabs, and the open tab. */
export function OrganizationsRoute() {
  const { t } = useTranslation();
  const { isLoading: isOrganizationLoading, organizationsVisible } = useOrganization();
  const { activeOrganization, can } = useOrganizationSettingsAccess();

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
      <PageHeader eyebrow={activeOrganization?.name} title={t("navigation.organization")} />
      <SettingsTabs
        basePath="/organization"
        label={t("navigation.organizationTabs")}
        tabs={ORGANIZATION_TABS.filter((tab) => !("permission" in tab) || can(tab.permission))}
      />
      <div>
        <Outlet />
      </div>
    </section>
  );
}
