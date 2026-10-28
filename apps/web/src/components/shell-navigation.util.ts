import type { BreadcrumbItem } from "@repo/ui";

import {
  SHELL_NAVIGATION_GROUPS,
  SHELL_NAVIGATION_ITEMS,
  type ShellNavigationContext,
  type ShellNavigationItem,
  type ShellNavigationTab
} from "./shell-navigation.definition";

export function isNavItemActive(pathname: string, item: ShellNavigationItem): boolean {
  if (pathname === item.href) return true;
  return item.match === "prefix" && pathname.startsWith(`${item.href}/`);
}

/** The visible sidebar groups in order, each with its visible items; empty groups are left out. */
export function groupShellNavigation(context: ShellNavigationContext) {
  return SHELL_NAVIGATION_GROUPS.map((group) => ({
    group,
    items: SHELL_NAVIGATION_ITEMS.filter(
      (item) => (item.visible?.(context) ?? true) && item.group === group
    )
  })).filter(({ items }) => items.length > 0);
}

/** The tab of a tabbed settings page that `pathname` shows, if any. */
export function findActiveShellTab(pathname: string): ShellNavigationTab | undefined {
  const item = SHELL_NAVIGATION_ITEMS.find((candidate) => isNavItemActive(pathname, candidate));
  const segment = item ? pathname.slice(item.href.length + 1).split("/")[0] : undefined;
  return item?.tabs?.find((tab) => tab.segment === segment);
}

/** App › page, plus an optional tab level; an unknown path falls back to the dashboard. */
export function buildShellBreadcrumbs(
  t: (key: string) => string,
  pathname: string,
  tabLabel?: string
): BreadcrumbItem[] {
  const current = SHELL_NAVIGATION_ITEMS.find((item) => isNavItemActive(pathname, item));
  const page = {
    href: current?.href ?? "/dashboard",
    label: t(current?.titleKey ?? "navigation.dashboard")
  };

  return [
    { href: "/dashboard", label: t("common.appName") },
    tabLabel === undefined ? { label: page.label } : page,
    ...(tabLabel === undefined ? [] : [{ label: tabLabel }])
  ];
}
