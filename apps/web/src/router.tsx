import { SUPPORTED_LANGUAGES } from "@repo/translation";
import { AppLayout, Header, LanguageSwitcher, Sidebar, ThemeSwitcher, UserMenu } from "@repo/ui";
import { Navigate, NavLink, Outlet, createBrowserRouter } from "react-router-dom";

import { AuthRoute } from "./features/auth/auth.route";
import { DashboardRoute } from "./features/dashboard/dashboard.route";
import { TodosRoute } from "./features/todos/todos.route";
import { useAuth } from "./hooks/use-auth";
import { useTheme } from "./hooks/use-theme";
import { useTranslation } from "./hooks/use-translation";
import { useSidebarStore } from "./stores/sidebar.store";

const THEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" }
] as const;

function ShellLayout() {
  const { isLoading, logout, session } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const { setThemeMode, themeMode } = useTheme();
  const isCollapsed = useSidebarStore((state) => state.isCollapsed);
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);

  if (isLoading) {
    return <p className="web-loading">Loading session...</p>;
  }

  if (!session) {
    return <Navigate replace to="/auth" />;
  }

  return (
    <AppLayout
      header={
        <Header
          left={<strong className="web-logo">Kaine Forge</strong>}
          right={
            <>
              <LanguageSwitcher
                label={t("navigation.language")}
                options={SUPPORTED_LANGUAGES.map((value) => ({
                  label: value.toUpperCase(),
                  value
                }))}
                value={language}
                onChange={(value) => {
                  void setLanguage(value);
                }}
              />
              <ThemeSwitcher
                label={t("navigation.theme")}
                options={[...THEME_OPTIONS]}
                value={themeMode}
                onChange={(value) => {
                  if (value === "dark" || value === "light" || value === "system") {
                    setThemeMode(value);
                  }
                }}
              />
              <UserMenu
                displayName={session.user.name}
                logoutLabel={t("auth.logout")}
                onLogout={() => void logout()}
              />
            </>
          }
        />
      }
      main={<Outlet />}
      sidebar={
        <Sidebar collapsed={isCollapsed} onToggle={toggleSidebar}>
          <NavLink className="web-nav-link" to="/dashboard">
            {isCollapsed ? "D" : t("navigation.dashboard")}
          </NavLink>
          <NavLink className="web-nav-link" to="/todos">
            {isCollapsed ? "T" : t("navigation.todos")}
          </NavLink>
        </Sidebar>
      }
    />
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
