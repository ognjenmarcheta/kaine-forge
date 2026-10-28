// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { appRoutes } from "./router";

const READY = {
  dashboard: "dashboard ready",
  onboarding: "onboarding ready",
  todos: "todos ready"
};
const signedIn = vi.hoisted(() => ({ value: true }));
const onboardingCompleted = vi.hoisted(() => ({ value: true }));
const translation = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    language: "en",
    listeners,
    setLanguage(next: string) {
      translation.language = next;
      for (const listener of listeners) listener();
    }
  };
});
const auditLogAccess = vi.hoisted(() => ({ value: false }));
const routeFailure = vi.hoisted(() => ({
  auth: false,
  dashboard: false,
  shell: false,
  todos: false
}));

vi.mock("./hooks/use-auth", () => ({
  useAuth: () => {
    if (routeFailure.shell) throw new Error("shell exploded");
    return {
      isLoading: false,
      logout: vi.fn(),
      session: signedIn.value
        ? {
            user: {
              email: "user@example.com",
              name: "User",
              onboardingCompleted: onboardingCompleted.value
            }
          }
        : null
    };
  }
}));
vi.mock("./hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: "organization-1",
    createOrganization: vi.fn(),
    hasError: false,
    isLoading: false,
    organizations: [],
    organizationsVisible: false,
    setActiveOrganization: vi.fn()
  })
}));
vi.mock("./hooks/use-translation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    translation.listeners.add(listener);
    return () => translation.listeners.delete(listener);
  };
  return {
    useTranslation: () => {
      const language = useSyncExternalStore(subscribe, () => translation.language);
      return {
        language,
        setLanguage: vi.fn(),
        // English returns the bare key so assertions read as translation keys.
        t: (key: string) => (language === "en" ? key : `${language}:${key}`)
      };
    }
  };
});
vi.mock("./hooks/use-theme", () => ({
  useTheme: () => ({ setThemeMode: vi.fn(), themeMode: "system" })
}));
vi.mock("./features/public-assets/public-assets.hook", () => ({
  usePublicAssets: () => ({ assets: null })
}));
vi.mock("./features/dashboard/dashboard.route", () => ({
  DashboardRoute: () => {
    if (routeFailure.dashboard) throw new Error("dashboard exploded");
    return <p>{READY.dashboard}</p>;
  }
}));
vi.mock("./features/todos/todos.route", () => ({
  TodosRoute: () => {
    if (routeFailure.todos) throw new Error("todos exploded");
    return <p>{READY.todos}</p>;
  }
}));
vi.mock("./features/assistant/assistant.route", () => ({ AssistantRoute: () => null }));
vi.mock("./features/auth/auth.route", () => ({
  AuthRoute: () => {
    if (routeFailure.auth) throw new Error("auth exploded");
    return null;
  }
}));
vi.mock("./features/notes/notes.route", () => ({ NotesRoute: () => null }));
vi.mock("./features/notifications/components/notification-bell", () => ({
  NotificationBell: () => null
}));
vi.mock("./features/onboarding/onboarding.route", () => ({
  OnboardingRoute: () => <p>{READY.onboarding}</p>
}));
vi.mock("./features/organizations/organizations.route", async () => {
  const { Outlet } = await import("react-router-dom");
  return { OrganizationsRoute: () => <Outlet /> };
});
vi.mock("./features/organizations/organizations.tabs.route", () => ({
  OrganizationDataTab: () => null,
  OrganizationGeneralTab: () => null,
  OrganizationMembersTab: () => null,
  OrganizationRolesTab: () => null
}));
vi.mock("./features/account/account.tabs.route", () => ({
  AccountDataTab: () => null,
  AccountProfileTab: () => null,
  AccountSecurityTab: () => null
}));
vi.mock("./features/account/components/account-sessions", () => ({ AccountSessions: () => null }));
vi.mock("./features/notifications/components/notification-preferences", () => ({
  NotificationPreferences: () => null
}));
vi.mock("./features/audit/audit.hook", () => ({ useAuditLogAccess: () => auditLogAccess.value }));
vi.mock("./features/organizations/organizations.hook", () => ({
  useOrganizationSettingsAccess: () => ({ can: () => false })
}));
vi.mock("./features/audit/audit.route", () => ({ AuditLogRoute: () => null }));
vi.mock("./features/organizations/organizations.theme", () => ({
  useApplyOrganizationTheme: () => undefined
}));
vi.mock("./features/api-keys/api-keys.hook", () => ({ useApiKeysAccess: () => null }));
vi.mock("./features/api-keys/api-keys.route", () => ({ ApiKeysRoute: () => null }));
vi.mock("./features/webhooks/webhooks.hook", () => ({ useWebhooksAccess: () => null }));
vi.mock("./features/webhooks/webhooks.route", () => ({ WebhooksRoute: () => null }));

let container: HTMLDivElement;
let root: Root;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }))
  );
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Object.assign(routeFailure, { auth: false, dashboard: false, shell: false, todos: false });
  signedIn.value = true;
  onboardingCompleted.value = true;
  auditLogAccess.value = false;
  translation.language = "en";
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

async function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  await act(async () => root.render(<RouterProvider router={router} />));
  return router;
}

function findByText(selector: string, text: string) {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.textContent === text
  );
}

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined();
  await act(async () => element?.click());
}

it("shows the error page inside the shell and retries the failed route", async () => {
  routeFailure.dashboard = true;
  await renderAt("/dashboard");

  expect(findByText("h1", "error.generic")).toBeDefined();
  expect(container.textContent).not.toContain("dashboard exploded");
  expect(findByText("a", "navigation.todos")).toBeDefined();
  expect(consoleError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "dashboard exploded" })
  );

  routeFailure.dashboard = false;
  await click(findByText("button", "common.retry"));

  expect(container.textContent).toContain(READY.dashboard);
  expect(findByText("h1", "error.generic")).toBeUndefined();
});

it("leaves a failed route through the go to dashboard action", async () => {
  routeFailure.todos = true;
  const router = await renderAt("/todos");

  await click(findByText("a", "common.goToDashboard"));

  expect(router.state.location.pathname).toBe("/dashboard");
  expect(container.textContent).toContain(READY.dashboard);
});

it.each([
  { failure: "shell", path: "/dashboard" },
  { failure: "auth", path: "/auth" }
] as const)(
  "shows the error page when the $failure layout route throws",
  async ({ failure, path }) => {
    routeFailure[failure] = true;
    await renderAt(path);

    expect(findByText("h1", "error.generic")).toBeDefined();
    expect(findByText("a", "common.goToDashboard")).toBeDefined();
  }
);

it.each([
  { canRead: true, link: "navigation.auditLog" },
  { canRead: false, link: undefined }
])(
  "shows the audit log link only to an owner or admin (can read: $canRead)",
  async ({ canRead, link }) => {
    auditLogAccess.value = canRead;
    await renderAt("/dashboard");

    expect(findByText("a", "navigation.auditLog")?.textContent).toBe(link);
  }
);

it("shows a titled not-found page for an unknown path", async () => {
  const router = await renderAt("/no-such-page");

  expect(router.state.location.pathname).toBe("/no-such-page");
  expect(findByText("h1", "notFound.title")).toBeDefined();
  expect(document.title).toBe("notFound.title · common.appName");

  await click(findByText("a", "common.goToDashboard"));

  expect(router.state.location.pathname).toBe("/dashboard");
});

it("titles the document per route and follows a language change", async () => {
  const router = await renderAt("/todos");

  expect(document.title).toBe("navigation.todos · common.appName");

  await act(async () => router.navigate("/dashboard"));
  expect(document.title).toBe("navigation.dashboard · common.appName");

  await act(async () => translation.setLanguage("de"));
  expect(document.title).toBe("de:navigation.dashboard · de:common.appName");
});

it.each([
  {
    path: "/members",
    pathname: "/organization/members",
    tab: "navigation.members",
    title: "navigation.members · navigation.organization · common.appName"
  },
  {
    path: "/security",
    pathname: "/account/security",
    tab: "navigation.security",
    title: "navigation.security · navigation.account · common.appName"
  },
  {
    path: "/organization",
    pathname: "/organization/general",
    tab: "navigation.general",
    title: "navigation.general · navigation.organization · common.appName"
  },
  {
    path: "/account",
    pathname: "/account/profile",
    tab: "navigation.profile",
    title: "navigation.profile · navigation.account · common.appName"
  },
  {
    path: "/organization/no-such-tab",
    pathname: "/organization/general",
    tab: "navigation.general",
    title: "navigation.general · navigation.organization · common.appName"
  },
  {
    path: "/account/no-such-tab",
    pathname: "/account/profile",
    tab: "navigation.profile",
    title: "navigation.profile · navigation.account · common.appName"
  },
  {
    path: "/account/sessions",
    pathname: "/account/sessions",
    tab: "navigation.sessions",
    title: "navigation.sessions · navigation.account · common.appName"
  }
])("opens $path as the settings tab $pathname", async ({ path, pathname, tab, title }) => {
  const router = await renderAt(path);

  expect(router.state.location.pathname).toBe(pathname);
  expect(document.title).toBe(title);
  expect(
    container.querySelector("[aria-label='navigation.breadcrumb'] li:last-child")?.textContent
  ).toBe(tab);
});

it.each([
  { heading: "legal.terms.title", path: "/terms" },
  { heading: "legal.privacy.title", path: "/privacy" }
])("shows $path to a signed-out visitor without a redirect", async ({ heading, path }) => {
  signedIn.value = false;
  const router = await renderAt(path);

  expect(router.state.location.pathname).toBe(path);
  expect(findByText("h1", heading)).toBeDefined();
  expect(document.title).toBe(`${heading} · common.appName`);
});

it("sends a signed-out visitor of the deletion link to sign in and back with the token", async () => {
  signedIn.value = false;

  const router = await renderAt("/account/delete?token=delete-token-1");

  expect(router.state.location.pathname).toBe("/auth");
  expect(router.state.location.search).toBe(
    "?redirect=%2Faccount%2Fdelete%3Ftoken%3Ddelete-token-1"
  );
});

it("sends a user who has not finished onboarding from the shell to onboarding", async () => {
  onboardingCompleted.value = false;

  const router = await renderAt("/dashboard");

  expect(router.state.location.pathname).toBe("/onboarding");
  expect(container.textContent).toBe(READY.onboarding);
  expect(document.title).toBe("auth.onboarding.title · common.appName");
});
