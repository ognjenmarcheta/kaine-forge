import { cn, tabsListClassName, tabsTriggerClassName } from "@repo/ui";
import { NavLink } from "react-router-dom";

import type { ShellNavigationTab } from "./shell-navigation.definition";
import { useTranslation } from "../hooks/use-translation";

interface SettingsTabsProps {
  basePath: string;
  label: string;
  tabs: readonly ShellNavigationTab[];
}

/**
 * The tabs of a settings page as links: the URL holds the open tab, so
 * refresh and back work. The list scrolls inside itself on a narrow screen.
 */
export function SettingsTabs({ basePath, label, tabs }: SettingsTabsProps) {
  const { t } = useTranslation();

  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto">
      <div className={cn(tabsListClassName, "flex w-max min-w-full justify-start")}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.segment}
            className={tabsTriggerClassName}
            to={`${basePath}/${tab.segment}`}
          >
            {t(tab.titleKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
