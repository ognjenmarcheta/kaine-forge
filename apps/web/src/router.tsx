import { SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  AppSidebar,
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
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@repo/ui";
import { useState } from "react";
import { Navigate, NavLink, Outlet, createBrowserRouter, useLocation } from "react-router-dom";

import { AssistantRoute } from "./features/assistant/assistant.route";
import { AuthRoute } from "./features/auth/auth.route";
import { DashboardRoute } from "./features/dashboard/dashboard.route";
import { NoteDetailRoute } from "./features/notes/note-detail.route";
import { NotesRoute } from "./features/notes/notes.route";
import { OrganizationCreateDialog } from "./features/organizations/components/organization-create-dialog";
import { OrganizationsRoute } from "./features/organizations/organizations.route";
import { TodosRoute } from "./features/todos/todos.route";
import { useAuth } from "./hooks/use-auth";
import { useOrganization } from "./hooks/use-organization";
import { useTheme } from "./hooks/use-theme";
import { useTranslation } from "./hooks/use-translation";

const THEME_OPTIONS = [
  { labelKey: "navigation.themeSystem", value: "system" },
  { labelKey: "navigation.themeLight", value: "light" },
  { labelKey: "navigation.themeDark", value: "dark" }
] as const;

const ROUTE_TO_BREADCRUMB = {
  "/assistant": "navigation.assistant",
  "/dashboard": "navigation.dashboard",
  "/members": "navigation.members",
  "/notes": "navigation.notes",
  "/todos": "navigation.todos"
} as const;

function isBreadcrumbRoute(pathname: string): pathname is keyof typeof ROUTE_TO_BREADCRUMB {
  return pathname in ROUTE_TO_BREADCRUMB;
}

function ShellLayout() {
  const location = useLocation();
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

  const isDashboardActive = location.pathname === "/dashboard";
  const isMembersActive = location.pathname === "/members";
  const isTodosActive = location.pathname === "/todos";
  const isNotesActive = location.pathname === "/notes" || location.pathname.startsWith("/notes/");
  const isAssistantActive = location.pathname === "/assistant";
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
                  : [])
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
                  onSelect: () => setIsCreateOrganizationOpen(true)
                }}
                className="w-full min-w-0 max-w-none"
                label={t("navigation.organization")}
                onValueChange={(value) => {
                  if (value !== "organization-placeholder") {
                    void setActiveOrganization(value);
                  }
                }}
                organizations={organizationOptions}
                {...(activeOrganizationValue ? { value: activeOrganizationValue } : {})}
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
      },
      {
        element: <NotesRoute />,
        path: "notes"
      },
      {
        element: <NoteDetailRoute />,
        path: "notes/:id"
      },
      {
        element: <AssistantRoute />,
        path: "assistant"
      },
      {
        element: <OrganizationsRoute />,
        path: "members"
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
