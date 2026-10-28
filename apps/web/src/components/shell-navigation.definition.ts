import type { Permission } from "@repo/auth/permissions";
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  NotebookPen,
  User,
  Users,
  Webhook,
  type NavMainItem
} from "@repo/ui";

/** What the shell knows about the session when it decides which items to show. */
export interface ShellNavigationContext {
  canReadApiKeys: boolean;
  canReadAuditLog: boolean;
  canReadWebhooks: boolean;
  organizationsVisible: boolean;
}

/** Sidebar groups render in this order. `account` items are not in the sidebar. */
export const SHELL_NAVIGATION_GROUPS = ["workspace", "organization"] as const;

export type ShellNavigationGroup = (typeof SHELL_NAVIGATION_GROUPS)[number] | "account";

export const SHELL_NAVIGATION_GROUP_LABEL_KEYS = {
  organization: "navigation.groupOrganization",
  workspace: "navigation.groupWorkspace"
} as const satisfies Record<(typeof SHELL_NAVIGATION_GROUPS)[number], string>;

/** One tab of a settings page; its route is `{item.href}/{segment}`. */
export interface ShellNavigationTab<Segment extends string = string> {
  /** Shown only when the session holds this Permission in the Active Organization. */
  permission?: Permission;
  segment: Segment;
  titleKey: `navigation.${string}`;
}

/** The first tab is the default that `/organization` and an unknown tab open. */
export const ORGANIZATION_TABS = [
  { segment: "general", titleKey: "navigation.general" },
  { segment: "members", titleKey: "navigation.members" },
  { permission: "ac:create", segment: "roles", titleKey: "navigation.roles" },
  { permission: "organization:export", segment: "data", titleKey: "navigation.data" },
  // Every member reads the Plan; only billing:manage offers checkout and the portal.
  { segment: "billing", titleKey: "navigation.billing" }
] as const satisfies readonly ShellNavigationTab[];

/** The first tab is the default that `/account` and an unknown tab open. */
export const ACCOUNT_TABS = [
  { segment: "profile", titleKey: "navigation.profile" },
  { segment: "security", titleKey: "navigation.security" },
  { segment: "sessions", titleKey: "navigation.sessions" },
  { segment: "notifications", titleKey: "navigation.notifications" },
  { segment: "data", titleKey: "navigation.data" }
] as const satisfies readonly ShellNavigationTab[];

export interface ShellNavigationItem {
  group: ShellNavigationGroup;
  href: string;
  icon: NonNullable<NavMainItem["icon"]>;
  id: string;
  /** `prefix` also matches nested paths such as `/notes/abc`. */
  match: "exact" | "prefix";
  /** A settings page with tabbed sub-routes; the breadcrumbs end on the active tab. */
  tabs?: readonly ShellNavigationTab[];
  titleKey: `navigation.${string}`;
  visible?: (context: ShellNavigationContext) => boolean;
}

export const SHELL_NAVIGATION_ITEMS: readonly ShellNavigationItem[] = [
  {
    group: "workspace",
    href: "/dashboard",
    icon: LayoutDashboard,
    id: "dashboard",
    match: "exact",
    titleKey: "navigation.dashboard"
  },
  {
    group: "workspace",
    href: "/todos",
    icon: ListTodo,
    id: "todos",
    match: "exact",
    titleKey: "navigation.todos"
  },
  {
    group: "workspace",
    href: "/notes",
    icon: NotebookPen,
    id: "notes",
    match: "prefix",
    titleKey: "navigation.notes"
  },
  {
    group: "workspace",
    href: "/assistant",
    icon: MessageSquare,
    id: "assistant",
    match: "exact",
    titleKey: "navigation.assistant"
  },
  {
    group: "organization",
    href: "/organization",
    icon: Users,
    id: "organization",
    match: "prefix",
    tabs: ORGANIZATION_TABS,
    titleKey: "navigation.organization",
    visible: (context) => context.organizationsVisible
  },
  {
    group: "organization",
    href: "/audit-log",
    icon: FileText,
    id: "audit-log",
    match: "exact",
    titleKey: "navigation.auditLog",
    visible: (context) => context.canReadAuditLog
  },
  {
    group: "organization",
    href: "/api-keys",
    icon: KeyRound,
    id: "api-keys",
    match: "exact",
    titleKey: "navigation.apiKeys",
    visible: (context) => context.canReadApiKeys
  },
  {
    group: "organization",
    href: "/webhooks",
    icon: Webhook,
    id: "webhooks",
    match: "exact",
    titleKey: "navigation.webhooks",
    visible: (context) => context.canReadWebhooks
  },
  {
    group: "account",
    href: "/account",
    icon: User,
    id: "account",
    match: "prefix",
    tabs: ACCOUNT_TABS,
    titleKey: "navigation.account"
  }
];
