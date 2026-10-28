import { PageHeader } from "@repo/ui";
import { Outlet } from "react-router-dom";

import { SettingsTabs } from "../../components/settings-tabs";
import { ACCOUNT_TABS } from "../../components/shell-navigation.definition";
import { useTranslation } from "../../hooks/use-translation";

/** The Account settings page: its header, its tabs, and the open tab. */
export function AccountRoute() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-ds-300">
      <PageHeader description={t("auth.account.summary")} title={t("auth.account.title")} />
      <SettingsTabs basePath="/account" label={t("navigation.accountTabs")} tabs={ACCOUNT_TABS} />
      <div>
        <Outlet />
      </div>
    </section>
  );
}
