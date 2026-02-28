import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  AppSidebar,
  AppLayout,
  Breadcrumbs,
  NavMain,
  NavPreferences,
  NavUser,
  Separator,
  TeamSwitcher,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@repo/ui";
import { useState } from "react";
import { Navigate, NavLink, Outlet, createBrowserRouter, useLocation } from "react-router-dom";

import { AuthRoute } from "./features/auth/auth.route";
import { DashboardRoute } from "./features/dashboard/dashboard.route";
import { OrganizationCreateDialog } from "./features/organizations/components/organization-create-dialog";
import { TodosRoute } from "./features/todos/todos.route";
import { useAuth } from "./hooks/use-auth";
import { useOrganization } from "./hooks/use-organization";
import { useTheme } from "./hooks/use-theme";
import { useTranslation } from "./hooks/use-translation";

const THEME_OPTIONS = [
  { labelKey: "navigation.themeSystem", value: "system" },
  { labelKey: "navigation.themeLight", value: "light" },
  { labelKey: "navigation.themeDark", value: "dark" },
  { labelKey: "navigation.themeLightHighContrast", value: "light-high-contrast" },
  { labelKey: "navigation.themeDarkHighContrast", value: "dark-high-contrast" }
] as const;

const ROUTE_TO_BREADCRUMB = {
  "/dashboard": "navigation.dashboard",
  "/todos": "navigation.todos"
} as const;

function ShellLayout() {
  const { isLoading, logout, session } = useAuth();
  const {
    activeOrganizationId,
    organizations,
    organizationsVisible,
    setActiveOrganization,
    createOrganization
  } = useOrganization();
  const { language, setLanguage, t } = useTranslation();
  const { setThemeMode, themeMode } = useTheme();
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] = useState(false);

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

  function ShellBody() {
    const location = useLocation();
    const isDashboardActive = location.pathname === "/dashboard";
    const isTodosActive = location.pathname === "/todos";
    const currentRouteKey =
      ROUTE_TO_BREADCRUMB[location.pathname as keyof typeof ROUTE_TO_BREADCRUMB] ??
      "navigation.dashboard";
    const activeTeamValue = activeOrganizationId ?? organizations[0]?.id;
    const breadcrumbItems = [
      {
        href: "/dashboard",
        label: t("common.appName")
      },
      {
        label: t(currentRouteKey)
      }
    ];

    return (
      <AppLayout
        header={
          <header className="flex h-16 shrink-0 items-center gap-[var(--ds-space-100)] border-b border-[var(--ds-border)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-[var(--ds-space-100)] px-[var(--ds-space-200)]">
              <SidebarTrigger className="-ml-1" label={t("navigation.toggleSidebar")} />
              <Separator
                orientation="vertical"
                className="mr-[var(--ds-space-100)] data-[orientation=vertical]:h-4"
              />
              <Breadcrumbs items={breadcrumbItems} />
            </div>
          </header>
        }
        main={
          <SidebarInset className="ui-app-shell__content">
            <Outlet />
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
                    isActive: isDashboardActive,
                    title: t("navigation.dashboard")
                  },
                  {
                    href: "/todos",
                    isActive: isTodosActive,
                    title: t("navigation.todos")
                  }
                ]}
                renderLink={(item, content) => <NavLink to={item.href ?? "#"}>{content}</NavLink>}
              />
            }
            navPreferences={
              <NavPreferences
                groupLabel={t("navigation.settings")}
                layout="inline-icons"
                language={{
                  label: t("navigation.language"),
                  onValueChange: (value) => {
                    void setLanguage(value);
                  },
                  options: SUPPORTED_LANGUAGES.map((value) => ({
                    label: value.toUpperCase(),
                    value
                  })),
                  value: language
                }}
                theme={{
                  label: t("navigation.theme"),
                  onValueChange: (value) => {
                    if (
                      value === "dark" ||
                      value === "light" ||
                      value === "system" ||
                      value === "light-high-contrast" ||
                      value === "dark-high-contrast"
                    ) {
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
            teamSwitcher={
              organizationsVisible ? (
                <TeamSwitcher
                  actionItem={{
                    label: t("navigation.organizationCreate"),
                    onSelect: () => setIsCreateOrganizationOpen(true)
                  }}
                  className="w-full min-w-0 max-w-none"
                  label={t("navigation.organization")}
                  onValueChange={(value) => {
                    void setActiveOrganization(value);
                  }}
                  teams={organizations.map((organization) => ({
                    name: organization.name,
                    subtitle: t("navigation.organization"),
                    value: organization.id
                  }))}
                  {...(activeTeamValue ? { value: activeTeamValue } : {})}
                />
              ) : null
            }
            user={
              <NavUser
                className="w-full min-w-0 max-w-none"
                logoutLabel={t("auth.logout")}
                onLogout={() => void logout()}
                user={{
                  email: currentSession.user.email,
                  name: currentSession.user.name
                }}
              />
            }
          />
        }
      />
    );
  }

  return (
    <>
      <SidebarProvider defaultOpen>
        <ShellBody />
      </SidebarProvider>
      <OrganizationCreateDialog
        isOpen={isCreateOrganizationOpen}
        onClose={() => setIsCreateOrganizationOpen(false)}
        onSubmit={createOrganization}
      />
    </>
  );
}

export const appRouter = createBrowserRouter([
  {
    element: <ShellLayout />,
    path: "/",
    children: [
      {
        element: <Navigate replace to="/dashboard" />,
        index: true
      },
      {
        element: <DashboardRoute />,
        path: "dashboard"
      },
      {
        element: <TodosRoute />,
        path: "todos"
      }
    ]
  },
  {
    element: <AuthRoute />,
    path: "/auth"
  },
  {
    element: <Navigate replace to="/" />,
    path: "*"
  }
]);
