import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  AppSidebar,
  FileText,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  MessageSquare,
  Users,
  AppLayout,
  Breadcrumbs,
  NavMain,
  NavPreferences,
  NavUser,
  Separator,
  OrganizationSwitcher,
  ShieldCheck,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@repo/ui";
import { useState } from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  createBrowserRouter,
  useLocation,
  useNavigate,
  type RouteObject
} from "react-router-dom";

import { NotFoundPage } from "./components/not-found.page";
import { RouteErrorPage } from "./components/route-error.page";
import {
  WorkspaceNavigationProvider,
  useWorkspaceNavigation
} from "./components/workspace-navigation.provider";
import { AccountDeleteRoute } from "./features/account/account.delete.route";
import { AccountRoute } from "./features/account/account.route";
import { AssistantRoute } from "./features/assistant/assistant.route";
import { useAuditLogAccess } from "./features/audit/audit.hook";
import { AuditLogRoute } from "./features/audit/audit.route";
import { AuthRoute } from "./features/auth/auth.route";
import { DashboardRoute } from "./features/dashboard/dashboard.route";
import { LegalRoute } from "./features/legal/legal.route";
import { NotesRoute } from "./features/notes/notes.route";
import { OrganizationCreateDialog } from "./features/organizations/components/organization-create-dialog";
import { OrganizationInvitationRoute } from "./features/organizations/organizations.invitation.route";
import { OrganizationsRoute } from "./features/organizations/organizations.route";
import { usePublicAssets } from "./features/public-assets/public-assets.hook";
import { SecurityRoute } from "./features/security/security.route";
import { TodosRoute } from "./features/todos/todos.route";
import { useAuth } from "./hooks/use-auth";
import { useOrganization } from "./hooks/use-organization";
import { useRouteTitle } from "./hooks/use-route-title";
import { useTheme } from "./hooks/use-theme";
import { useTranslation } from "./hooks/use-translation";
import { saveEmailLanguageRequest } from "./lib/auth-api";

const THEME_OPTIONS = [
  { labelKey: "navigation.themeSystem", value: "system" },
  { labelKey: "navigation.themeLight", value: "light" },
  { labelKey: "navigation.themeDark", value: "dark" }
] as const;

const ROUTE_TO_BREADCRUMB = {
  "/account": "navigation.account",
  "/assistant": "navigation.assistant",
  "/audit-log": "navigation.auditLog",
  "/dashboard": "navigation.dashboard",
  "/members": "navigation.members",
  "/notes": "navigation.notes",
  "/security": "navigation.security",
  "/todos": "navigation.todos"
} as const;

function isBreadcrumbRoute(pathname: string): pathname is keyof typeof ROUTE_TO_BREADCRUMB {
  return pathname in ROUTE_TO_BREADCRUMB;
}

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
  const canReadAuditLog = useAuditLogAccess(activeOrganizationId);

  if (isLoading) {
    return (
      <p className="p-[var(--ds-space-300)] text-[color:var(--ds-text-subtle)]">
        {t("common.loadingSession")}
      </p>
    );
  }

  if (!session) {
    return <Navigate replace to="/auth" />;
  }

  const currentSession = session;

  const isDashboardActive = location.pathname === "/dashboard";
  const isMembersActive = location.pathname === "/members";
  const isTodosActive = location.pathname === "/todos";
  const isNotesActive = location.pathname === "/notes" || location.pathname.startsWith("/notes/");
  const isAssistantActive = location.pathname === "/assistant";
  const isSecurityActive = location.pathname === "/security";
  const isAuditLogActive = location.pathname === "/audit-log";
  const currentRouteKey = isBreadcrumbRoute(location.pathname)
    ? ROUTE_TO_BREADCRUMB[location.pathname]
    : isNotesActive
      ? "navigation.notes"
      : "navigation.dashboard";
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
  const breadcrumbItems = [
    {
      href: "/dashboard",
      label: t("common.appName")
    },
    {
      label: t(currentRouteKey)
    }
  ];

  const layout = (
    <AppLayout
      header={
        <header className="ui-app-shell__header">
          <div className="flex items-center gap-[var(--ds-space-100)] px-[var(--ds-space-200)]">
            <SidebarTrigger className="-ml-1" label={t("navigation.toggleSidebar")} />
            <Separator
              orientation="vertical"
              className="mr-[var(--ds-space-100)] data-[orientation=vertical]:h-4"
            />
            <Breadcrumbs ariaLabel={t("navigation.breadcrumb")} items={breadcrumbItems} />
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
          mobileSheetCloseLabel={t("common.close")}
          mobileSheetDescription={t("navigation.mobileSidebarDescription")}
          mobileSheetTitle={t("navigation.sidebarTitle")}
          navMain={
            <NavMain
              groupLabel={t("common.appName")}
              items={[
                {
                  href: "/dashboard",
                  icon: LayoutDashboard,
                  isActive: isDashboardActive,
                  title: t("navigation.dashboard")
                },
                {
                  href: "/todos",
                  icon: ListTodo,
                  isActive: isTodosActive,
                  title: t("navigation.todos")
                },
                {
                  href: "/notes",
                  icon: NotebookPen,
                  isActive: isNotesActive,
                  title: t("navigation.notes")
                },
                {
                  href: "/assistant",
                  icon: MessageSquare,
                  isActive: isAssistantActive,
                  title: t("navigation.assistant")
                },
                ...(organizationsVisible
                  ? [
                      {
                        href: "/members",
                        icon: Users,
                        isActive: isMembersActive,
                        title: t("navigation.members")
                      }
                    ]
                  : []),
                ...(canReadAuditLog
                  ? [
                      {
                        href: "/audit-log",
                        icon: FileText,
                        isActive: isAuditLogActive,
                        title: t("navigation.auditLog")
                      }
                    ]
                  : []),
                {
                  href: "/security",
                  icon: ShieldCheck,
                  isActive: isSecurityActive,
                  title: t("navigation.security")
                }
              ]}
              renderLink={(item, content) => <NavLink to={item.href ?? "#"}>{content}</NavLink>}
            />
          }
          navPreferences={
            <NavPreferences
              groupLabel={t("navigation.settings")}
              layout="footer"
              language={{
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
              }}
              theme={{
                label: t("navigation.theme"),
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
              }}
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
      <OrganizationCreateDialog
        isOpen={isCreateOrganizationOpen}
        onClose={() => setIsCreateOrganizationOpen(false)}
        onSubmit={createOrganization}
      />
    </>
  );
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
                element: <OrganizationsRoute />,
                handle: { titleKey: "navigation.members" },
                path: "members"
              },
              {
                element: <AccountRoute />,
                handle: { titleKey: "navigation.account" },
                path: "account"
              },
              {
                element: <AuditLogRoute />,
                handle: { titleKey: "navigation.auditLog" },
                path: "audit-log"
              },
              {
                element: <SecurityRoute />,
                handle: { titleKey: "navigation.security" },
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
