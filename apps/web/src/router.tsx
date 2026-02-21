import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  AppLayout,
  Header,
  LabeledSelect,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  UserMenu
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
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" }
] as const;

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

    return (
      <AppLayout
        header={
          <Header
            left={<strong>{t("common.appName")}</strong>}
            right={
              <>
                {organizationsVisible ? (
                  <LabeledSelect
                    actionItem={{
                      label: t("navigation.organizationCreate"),
                      onSelect: () => setIsCreateOrganizationOpen(true)
                    }}
                    label={t("navigation.organization")}
                    options={organizations.map((organization) => ({
                      label: organization.name,
                      value: organization.id
                    }))}
                    value={activeOrganizationId ?? organizations[0]?.id}
                    onValueChange={(value) => {
                      void setActiveOrganization(value);
                    }}
                  />
                ) : null}
                <LabeledSelect
                  label={t("navigation.language")}
                  options={SUPPORTED_LANGUAGES.map((value) => ({
                    label: value.toUpperCase(),
                    value
                  }))}
                  value={language}
                  onValueChange={(value) => {
                    void setLanguage(value);
                  }}
                />
                <LabeledSelect
                  label={t("navigation.theme")}
                  options={[...THEME_OPTIONS]}
                  value={themeMode}
                  onValueChange={(value) => {
                    if (value === "dark" || value === "light" || value === "system") {
                      setThemeMode(value);
                    }
                  }}
                />
                <UserMenu
                  displayName={currentSession.user.name}
                  logoutLabel={t("auth.logout")}
                  onLogout={() => void logout()}
                />
              </>
            }
          />
        }
        main={
          <SidebarInset className="ui-app-shell__content">
            <Outlet />
          </SidebarInset>
        }
        sidebar={
          <Sidebar>
            <SidebarHeader>
              <SidebarTrigger />
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>{t("common.appName")}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isDashboardActive}>
                        <NavLink to="/dashboard">{t("navigation.dashboard")}</NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={isTodosActive}>
                        <NavLink to="/todos">{t("navigation.todos")}</NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
          </Sidebar>
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
