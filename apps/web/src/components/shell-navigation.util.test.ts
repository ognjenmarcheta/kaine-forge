import { describe, expect, it } from "vitest";

import { SHELL_NAVIGATION_ITEMS } from "./shell-navigation.definition";
import {
  buildShellBreadcrumbs,
  findActiveShellTab,
  groupShellNavigation,
  isNavItemActive
} from "./shell-navigation.util";

function itemById(id: string) {
  const item = SHELL_NAVIGATION_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`No navigation item ${id}`);
  return item;
}

describe("isNavItemActive", () => {
  it.each([
    ["notes", "/notes", true],
    ["notes", "/notes/abc", true],
    ["notes", "/notes-archive", false],
    ["dashboard", "/dashboard", true],
    ["dashboard", "/dashboard/extra", false],
    ["todos", "/todos-archive", false],
    ["organization", "/organization/roles", true],
    ["account", "/account/security", true],
    ["account", "/accounts", false]
  ])("%s on %s is %s", (id, pathname, expected) => {
    expect(isNavItemActive(pathname, itemById(id))).toBe(expected);
  });
});

describe("groupShellNavigation", () => {
  it.each([
    [
      "hides the organization group without organizations or audit access",
      {
        canReadApiKeys: false,
        canReadAuditLog: false,
        canReadWebhooks: false,
        organizationsVisible: false
      },
      [["workspace", ["dashboard", "todos", "notes", "assistant"]]]
    ],
    [
      "shows only the audit log in the organization group without organizations",
      {
        canReadApiKeys: false,
        canReadAuditLog: true,
        canReadWebhooks: false,
        organizationsVisible: false
      },
      [
        ["workspace", ["dashboard", "todos", "notes", "assistant"]],
        ["organization", ["audit-log"]]
      ]
    ],
    [
      "shows the organization settings but no audit log without audit access",
      {
        canReadApiKeys: false,
        canReadAuditLog: false,
        canReadWebhooks: false,
        organizationsVisible: true
      },
      [
        ["workspace", ["dashboard", "todos", "notes", "assistant"]],
        ["organization", ["organization"]]
      ]
    ]
  ])("%s", (_name, context, expected) => {
    expect(
      groupShellNavigation(context).map(({ group, items }) => [group, items.map(({ id }) => id)])
    ).toEqual(expected);
  });
});

describe("findActiveShellTab", () => {
  it.each([
    ["/organization/members", "navigation.members"],
    ["/account/data", "navigation.data"],
    ["/organization/roles/extra", "navigation.roles"],
    ["/organization/unknown", undefined],
    ["/organization", undefined],
    ["/notes/abc", undefined]
  ])("%s shows the tab %s", (pathname, titleKey) => {
    expect(findActiveShellTab(pathname)?.titleKey).toBe(titleKey);
  });
});

describe("buildShellBreadcrumbs", () => {
  const t = (key: string) => key;

  it("names the section of a nested path", () => {
    expect(buildShellBreadcrumbs(t, "/notes/abc")).toEqual([
      { href: "/dashboard", label: "common.appName" },
      { label: "navigation.notes" }
    ]);
  });

  it("links the section and ends on the tab when a tab is given", () => {
    expect(buildShellBreadcrumbs(t, "/account", "Security")).toEqual([
      { href: "/dashboard", label: "common.appName" },
      { href: "/account", label: "navigation.account" },
      { label: "Security" }
    ]);
  });
});
