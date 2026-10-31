import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  AppSidebar,
  AppLayout,
  Breadcrumbs,
  NavMain,
  NavPreferences,
  NavUser,
  type NavPreferencesProps,
  Separator,
  OrganizationSwitcher,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Skeleton
} from "@repo/ui";
import { useState, type ReactElement } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  createBrowserRouter,
  useLocation,
  useNavigate,
  type RouteObject
} from "react-router-dom";

import { ShellCommandMenu } from "./components/command-menu";
import { CommandMenuButton } from "./components/command-menu-button";
import { NotFoundPage } from "./components/not-found.page";
import { RouteErrorPage } from "./components/route-error.page";
import {
  ACCOUNT_TABS,
  ORGANIZATION_TABS,
  SHELL_NAVIGATION_GROUP_LABEL_KEYS,
  type ShellNavigationTab
} from "./components/shell-navigation.definition";
import {
  buildShellBreadcrumbs,
  findActiveShellTab,
  groupShellNavigation,
  isNavItemActive
} from "./components/shell-navigation.util";
import { SyncStatusBadge } from "./components/sync-status";
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "./components/workspace-navigation.provider";
import { AccountDeleteRoute } from "./features/account/account.delete.route";
import { AccountRoute } from "./features/account/account.route";
import {
  AccountDataTab,
  AccountProfileTab,
  AccountSecurityTab
} from "./features/account/account.tabs.route";
import { AccountSessions } from "./features/account/components/account-sessions";
import { useApiKeysAccess } from "./features/api-keys/api-keys.hook";
import { ApiKeysRoute } from "./features/api-keys/api-keys.route";
import { AssistantRoute } from "./features/assistant/assistant.route";
import { useAuditLogAccess } from "./features/audit/audit.hook";
import { AuditLogRoute } from "./features/audit/audit.route";
import { AuthRoute } from "./features/auth/auth.route";
import { DashboardRoute } from "./features/dashboard/dashboard.route";
import { LegalRoute } from "./features/legal/legal.route";
import { NotesRoute } from "./features/notes/notes.route";
import { NotificationBell } from "./features/notifications/components/notification-bell";
import { NotificationPreferences } from "./features/notifications/components/notification-preferences";
import { OnboardingRoute } from "./features/onboarding/onboarding.route";
import { needsOnboarding } from "./features/onboarding/onboarding.util";
import { OrganizationCreateDialog } from "./features/organizations/components/organization-create-dialog";
import { OrganizationInvitationRoute } from "./features/organizations/organizations.invitation.route";
import { OrganizationsRoute } from "./features/organizations/organizations.route";
import {
  OrganizationBillingTab,
  OrganizationDataTab,
  OrganizationGeneralTab,
  OrganizationMembersTab,
  OrganizationRolesTab
} from "./features/organizations/organizations.tabs.route";
import { useApplyOrganizationTheme } from "./features/organizations/organizations.theme";
import { usePublicAssets } from "./features/public-assets/public-assets.hook";
import { TodosRoute } from "./features/todos/todos.route";
import { useWebhooksAccess } from "./features/webhooks/webhooks.hook";
import { WebhooksRoute } from "./features/webhooks/webhooks.route";
import { useAuth } from "./hooks/use-auth";
import { useOrganization } from "./hooks/use-organization";
import { useRouteTitle } from "./hooks/use-route-title";
import { useTheme } from "./hooks/use-theme";
import { useTranslation } from "./hooks/use-translation";
import { saveEmailLanguageRequest } from "./lib/auth-api";

const THEME_OPTIONS = [
  { labelKey: "navigation.appearanceSystem", value: "system" },
  { labelKey: "navigation.appearanceLight", value: "light" },
  { labelKey: "navigation.appearanceDark", value: "dark" }
] as const;

function RootLayout() {
  useRouteTitle();
  return <Outlet />;
}

function ShellLayout() {
  return (
    <WorkspaceNavigationProvider>
      <ShellContent />
    </WorkspaceNavigationProvider>
  );
}

/** Holds the shell's layout while the session loads, so the page does not jump. */
function ShellSkeleton({ label }: { label: string }) {
  return (
    <SidebarProvider defaultOpen>
      <AppLayout
        header={
          <header className="ui-app-shell__header">
            <div className="flex flex-1 items-center gap-ds-150 px-ds-200">
              <Skeleton className="size-ds-300" />
              <Skeleton className="h-ds-200 w-1/4" />
            </div>
          </header>
        }
        main={
          <SidebarInset className="ui-app-shell__content">
            <div aria-busy="true" className="grid gap-ds-200" role="status">
              <span className="sr-only">{label}</span>
              <Skeleton className="h-ds-500 w-1/3" />
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-ds-800 w-full" />
              ))}
            </div>
          </SidebarInset>
        }
        sidebar={
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <Skeleton className="h-ds-600 w-full" />
            </SidebarHeader>
            <SidebarContent className="gap-ds-150 p-ds-200">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-ds-400 w-full" />
              ))}
            </SidebarContent>
          </Sidebar>
        }
      />
    </SidebarProvider>
  );
}

function ShellContent() {
  const { requestLeave } = useWorkspaceNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading, logout, session } = useAuth();
  const {
    activeOrganizationId,
    hasError,
    isLoading: isOrganizationLoading,
    organizations,
    organizationsVisible,
    setActiveOrganization,
    createOrganization
  } = useOrganization();
  const { language, setLanguage, t } = useTranslation();
  const { setThemeMode, themeMode } = useTheme();
  const { assets: publicAssets } = usePublicAssets();
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const canReadAuditLog = useAuditLogAccess(activeOrganizationId);
  const canReadApiKeys = useApiKeysAccess(activeOrganizationId);
  const canReadWebhooks = useWebhooksAccess(activeOrganizationId);
  useApplyOrganizationTheme(session ? activeOrganizationId : null);

  if (isLoading) {
    return <ShellSkeleton label={t("common.loadingSession")} />;
  }

  if (!session) {
    return <Navigate replace to="/auth" />;
  }

  if (needsOnboarding(session)) {
    return <Navigate replace to="/onboarding" />;
  }

  const currentSession = session;

  const navigationContext = {
    canReadApiKeys: canReadApiKeys === true,
    canReadAuditLog: canReadAuditLog === true,
    canReadWebhooks: canReadWebhooks === true,
    organizationsVisible
  };
  const navigationGroups = groupShellNavigation(navigationContext);
  const preferences: Pick<NavPreferencesProps, "language" | "theme"> = {
    language: {
      label: t("navigation.language"),
      onValueChange: (value) => {
        void setLanguage(value);
        // A failed write keeps the old email language; the UI still switches.
        saveEmailLanguageRequest(value).catch(() => undefined);
      },
      options: SUPPORTED_LANGUAGES.map((value) => ({
        label: t(`navigation.languageName.${value}`),
        value
      })),
      value: language
    },
    theme: {
      label: t("navigation.appearance"),
      onValueChange: (value) => {
        if (value === "dark" || value === "light" || value === "system") {
          setThemeMode(value);
        }
      },
      options: THEME_OPTIONS.map((themeOption) => ({
        label: t(themeOption.labelKey),
        value: themeOption.value
      })),
      value: themeMode
    }
  };
  const organizationOptions =
    organizations.length > 0
      ? organizations.map((organization) => ({
          name: organization.name,
          subtitle: t("navigation.organization"),
          value: organization.id
        }))
      : [
          {
            disabled: true,
            name:
              isOrganizationLoading && !hasError
                ? t("navigation.organizationLoading")
                : t("navigation.organizationUnavailable"),
            subtitle: t("navigation.organization"),
            value: "organization-placeholder"
          }
        ];
  const activeOrganizationValue =
    activeOrganizationId ?? organizations[0]?.id ?? organizationOptions[0]?.value;
  const activeTab = findActiveShellTab(location.pathname);
  const breadcrumbItems = buildShellBreadcrumbs(
    t,
    location.pathname,
    activeTab ? t(activeTab.titleKey) : undefined
  );

  const layout = (
    <AppLayout
      header={
        <header className="ui-app-shell__header">
          <div className="flex w-full items-center gap-ds-100 px-ds-200">
            <SidebarTrigger className="-ml-1" label={t("navigation.toggleSidebar")} />
            <Separator
              orientation="vertical"
              className="mr-ds-100 data-[orientation=vertical]:h-4"
            />
            {/* A long trail clips before it pushes the header's controls off screen. */}
            <Breadcrumbs
              ariaLabel={t("navigation.breadcrumb")}
              className="min-w-0 overflow-hidden"
              items={breadcrumbItems}
            />
            <div className="ml-auto flex items-center gap-ds-100">
              <SyncStatusBadge />
              <CommandMenuButton onOpen={() => setIsCommandMenuOpen(true)} />
              <NotificationBell />
            </div>
          </div>
        </header>
      }
      main={
        <SidebarInset className="ui-app-shell__content">
          <Outlet key={activeOrganizationId} />
        </SidebarInset>
      }
      sidebar={
        <AppSidebar
          label={t("navigation.sidebarTitle")}
          mobileSheetCloseLabel={t("common.close")}
          mobileSheetDescription={t("navigation.mobileSidebarDescription")}
          mobileSheetTitle={t("navigation.sidebarTitle")}
          navMain={navigationGroups.map(({ group, items }) => (
            <NavMain
              key={group}
              groupLabel={t(SHELL_NAVIGATION_GROUP_LABEL_KEYS[group])}
              items={items.map((item) => ({
                href: item.href,
                icon: item.icon,
                isActive: isNavItemActive(location.pathname, item),
                title: t(item.titleKey)
              }))}
              renderLink={(item, content) => <NavLink to={item.href ?? "#"}>{content}</NavLink>}
            />
          ))}
          navPreferences={
            <NavPreferences
              groupLabel={t("navigation.settings")}
              layout="footer"
              {...preferences}
            />
          }
          railLabel={t("navigation.toggleSidebar")}
          organizationSwitcher={
            organizationsVisible ? (
              <OrganizationSwitcher
                actionItem={{
                  label: t("navigation.organizationCreate"),
                  onSelect: () => requestLeave(() => setIsCreateOrganizationOpen(true))
                }}
                className="w-full min-w-0 max-w-none"
                label={t("navigation.organization")}
                onValueChange={(value) => {
                  if (value !== "organization-placeholder") {
                    requestLeave(() => void setActiveOrganization(value));
                  }
                }}
                organizations={organizationOptions}
                {...(activeOrganizationValue ? { value: activeOrganizationValue } : {})}
              />
            ) : null
          }
          user={
            <NavUser
              accountItem={{
                label: t("navigation.account"),
                onSelect: () => requestLeave(() => void navigate("/account"))
              }}
              className="w-full min-w-0 max-w-none"
              logoutLabel={t("auth.logout")}
              onLogout={() => requestLeave(() => void logout())}
              user={{
                email: currentSession.user.email,
                name: currentSession.user.name,
                ...(publicAssets?.avatarUrl ? { avatar: publicAssets.avatarUrl } : {})
              }}
            />
          }
        />
      }
    />
  );

  return (
    <>
      <SidebarProvider defaultOpen>{layout}</SidebarProvider>
      <ShellCommandMenu
        navigationContext={navigationContext}
        onOpenChange={setIsCommandMenuOpen}
        open={isCommandMenuOpen}
        preferences={preferences}
      />
      <OrganizationCreateDialog
        isOpen={isCreateOrganizationOpen}
        onClose={() => setIsCreateOrganizationOpen(false)}
        onSubmit={createOrganization}
      />
    </>
  );
}

/**
 * The tab routes of a settings page. The page path and an unknown tab open the
 * first tab, so the URL always names the open tab.
 */
function settingsTabRoutes<Segment extends string>(
  basePath: string,
  tabs: readonly [ShellNavigationTab<NoInfer<Segment>>, ...ShellNavigationTab<NoInfer<Segment>>[]],
  elements: Record<Segment, ReactElement>
): RouteObject[] {
  const toFirstTab = <Navigate replace to={`${basePath}/${tabs[0].segment}`} />;

  return [
    { element: toFirstTab, index: true },
    ...tabs.map((tab) => ({
      element: elements[tab.segment],
      handle: { titleKey: tab.titleKey },
      path: tab.segment
    })),
    { element: toFirstTab, path: "*" }
  ];
}

export const appRoutes: RouteObject[] = [
  {
    // Pathless root: sets the document title from the deepest `handle.titleKey`.
    element: <RootLayout />,
    children: [
      {
        element: <ShellLayout />,
        errorElement: <RouteErrorPage />,
        path: "/",
        children: [
          {
            // Pathless so a failing child route keeps the shell and its sidebar.
            errorElement: <RouteErrorPage />,
            children: [
              {
                element: <Navigate replace to="/dashboard" />,
                index: true
              },
              {
                element: <DashboardRoute />,
                handle: { titleKey: "navigation.dashboard" },
                path: "dashboard"
              },
              {
                element: <TodosRoute />,
                handle: { titleKey: "navigation.todos" },
                path: "todos"
              },
              {
                element: <NotesRoute />,
                handle: { titleKey: "navigation.notes" },
                path: "notes/:id?"
              },
              {
                element: <AssistantRoute />,
                handle: { titleKey: "navigation.assistant" },
                path: "assistant"
              },
              {
                // The page moved into an Organization tab; old links still land there.
                element: <Navigate replace to="/organization/members" />,
                path: "members"
              },
              {
                element: <OrganizationsRoute />,
                handle: { titleKey: "navigation.organization" },
                path: "organization",
                children: settingsTabRoutes("/organization", ORGANIZATION_TABS, {
                  billing: <OrganizationBillingTab />,
                  data: <OrganizationDataTab />,
                  general: <OrganizationGeneralTab />,
                  members: <OrganizationMembersTab />,
                  roles: <OrganizationRolesTab />
                })
              },
              {
                // `/account/delete` is a top-level route; its static path wins over the tabs' `*`.
                element: <AccountRoute />,
                handle: { titleKey: "navigation.account" },
                path: "account",
                children: settingsTabRoutes("/account", ACCOUNT_TABS, {
                  data: <AccountDataTab />,
                  notifications: <NotificationPreferences />,
                  profile: <AccountProfileTab />,
                  security: <AccountSecurityTab />,
                  sessions: <AccountSessions />
                })
              },
              {
                element: <AuditLogRoute />,
                handle: { titleKey: "navigation.auditLog" },
                path: "audit-log"
              },
              {
                element: <ApiKeysRoute />,
                handle: { titleKey: "navigation.apiKeys" },
                path: "api-keys"
              },
              {
                element: <WebhooksRoute />,
                handle: { titleKey: "navigation.webhooks" },
                path: "webhooks"
              },
              {
                // The page moved into an Account tab; old links still land there.
                element: <Navigate replace to="/account/security" />,
                path: "security"
              }
            ]
          }
        ]
      },
      {
        element: <AuthRoute />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "auth.login.title" },
        path: "/auth"
      },
      {
        // Outside the shell: a signed-out visitor goes to /auth and comes back
        // with the emailed token.
        element: <AccountDeleteRoute />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "auth.account.delete.confirmTitle" },
        path: "/account/delete"
      },
      {
        // Outside the shell, which sends a new user here until it ends.
        element: <OnboardingRoute />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "auth.onboarding.title" },
        path: "/onboarding"
      },
      {
        // Outside the shell: a signed-out visitor goes to /auth and comes back.
        element: <OrganizationInvitationRoute />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "organizations.invitation.title" },
        path: "/invitations/:invitationId"
      },
      {
        element: <LegalRoute page="terms" />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "legal.terms.title" },
        path: "/terms"
      },
      {
        element: <LegalRoute page="privacy" />,
        errorElement: <RouteErrorPage />,
        handle: { titleKey: "legal.privacy.title" },
        path: "/privacy"
      },
      {
        element: <NotFoundPage />,
        handle: { titleKey: "notFound.title" },
        path: "*"
      }
    ]
  }
];

export const appRouter = createBrowserRouter(appRoutes);
