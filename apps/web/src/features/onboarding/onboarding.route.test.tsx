// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { OnboardingRoute } from "./onboarding.route";

interface TestSession {
  user: { id: string; onboardingCompleted?: boolean };
}

const { auth, organization, api } = vi.hoisted(() => ({
  auth: { session: null as TestSession | null, refreshSession: vi.fn() },
  organization: {
    activeOrganizationId: "org-1",
    organizations: [{ id: "org-1", name: "Personal", personal: true as boolean }],
    createOrganization: vi.fn()
  },
  api: {
    complete: vi.fn(),
    inviteMember: vi.fn(),
    permissions: [] as string[],
    permissionsFail: false,
    renameOrganization: vi.fn()
  }
}));

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    refreshSession: auth.refreshSession,
    session: auth.session
  })
}));
vi.mock("../../hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: organization.activeOrganizationId,
    createOrganization: organization.createOrganization,
    hasError: false,
    isLoading: false,
    organizations: organization.organizations,
    organizationsVisible: true
  })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: () => () =>
    api.permissionsFail
      ? Promise.reject(new Error("Unavailable"))
      : Promise.resolve({ organizationPermissions: api.permissions })
}));
vi.mock("../../lib/auth-api", () => ({
  onboardingApi: { complete: api.complete },
  organizationApi: {
    inviteMember: api.inviteMember,
    renameOrganization: api.renameOrganization
  }
}));

function CurrentPath() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}

async function renderOnboarding() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/onboarding"]}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route path="*" element={<CurrentPath />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  );
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    }
  };
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === name
  );
  if (!match) throw new Error(`no button "${name}"`);
  return match;
}

function nameInput(container: HTMLElement): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent === "organizations.name"
  );
  return label ? container.querySelector<HTMLInputElement>(`#${CSS.escape(label.htmlFor)}`) : null;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function newUser(): TestSession {
  return { user: { id: "user-1", onboardingCompleted: false } };
}

// The completion call ends onboarding; the refreshed session then says so.
function completeOnboarding() {
  api.complete.mockImplementation(async () => {
    auth.session = { user: { id: "user-1", onboardingCompleted: true } };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  api.permissions = [];
  api.permissionsFail = false;
  organization.activeOrganizationId = "org-1";
  organization.organizations = [{ id: "org-1", name: "Personal", personal: true }];
});

it.each([
  ["a signed-out visitor to sign in and back", null, "/auth?redirect=%2Fonboarding"],
  [
    "a user who completed onboarding to the dashboard",
    { user: { id: "user-1", onboardingCompleted: true } },
    "/dashboard"
  ]
])("sends %s", async (_label, session, path) => {
  auth.session = session;
  const { container, cleanup } = await renderOnboarding();
  try {
    expect(container.textContent).toBe(path);
  } finally {
    await cleanup();
  }
});

it("renames the Personal Organization, then offers the invite step", async () => {
  auth.session = newUser();
  api.renameOrganization.mockResolvedValue(undefined);
  const { container, cleanup } = await renderOnboarding();
  try {
    const input = nameInput(container);
    expect(input?.value).toBe("Personal");
    await act(async () => {
      if (input) typeInto(input, " Acme ");
    });
    await act(async () => button(container, "auth.onboarding.organization.rename").click());

    // The rename names no organization: the server uses the Active Organization.
    expect(api.renameOrganization.mock.calls).toEqual([["Acme"]]);
    await vi.waitFor(() => expect(container.textContent).toContain("auth.onboarding.invite.title"));
    expect(nameInput(container)).toBeNull();
    expect(button(container, "auth.onboarding.finish")).toBeTruthy();
  } finally {
    await cleanup();
  }
});

it("creates a new Organization with the name instead of renaming", async () => {
  auth.session = newUser();
  organization.createOrganization.mockResolvedValue(undefined);
  const { container, cleanup } = await renderOnboarding();
  try {
    await act(async () => {
      const input = nameInput(container);
      if (input) typeInto(input, "Acme");
    });
    await act(async () => button(container, "auth.onboarding.organization.create").click());

    expect(organization.createOrganization.mock.calls).toEqual([["Acme"]]);
    expect(api.renameOrganization).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(container.textContent).toContain("auth.onboarding.invite.title"));
  } finally {
    await cleanup();
  }
});

it("skips onboarding from the first step and opens the dashboard", async () => {
  auth.session = newUser();
  completeOnboarding();
  const { container, cleanup } = await renderOnboarding();
  try {
    await act(async () => button(container, "auth.onboarding.skip").click());

    await vi.waitFor(() => expect(container.textContent).toBe("/dashboard"));
    expect(api.complete).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalled();
    expect(api.renameOrganization).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});

it("offers an invited member with invitation:create only the invite step and lists the Invitations sent", async () => {
  auth.session = newUser();
  organization.activeOrganizationId = "org-2";
  organization.organizations = [
    { id: "org-1", name: "Personal", personal: true },
    { id: "org-2", name: "Acme", personal: false }
  ];
  api.permissions = ["invitation:create", "member:update"];
  api.inviteMember.mockResolvedValue({
    email: "ada@example.com",
    expiresAt: "2026-11-03T00:00:00.000Z",
    id: "inv-1",
    role: "member",
    status: "pending"
  });
  const { container, cleanup } = await renderOnboarding();
  try {
    await vi.waitFor(() => expect(container.textContent).toContain("auth.onboarding.invite.title"));
    expect(nameInput(container)).toBeNull();

    await act(async () => {
      const email = container.querySelector<HTMLInputElement>('input[type="email"]');
      if (email) typeInto(email, "ada@example.com");
    });
    await act(async () => button(container, "organizations.invite.submit").click());

    expect(api.inviteMember.mock.calls[0]?.[0]).toEqual({
      email: "ada@example.com",
      role: "member"
    });
    await vi.waitFor(() =>
      expect(
        container.querySelector('[aria-label="auth.onboarding.invite.sentTitle"]')?.textContent
      ).toContain("ada@example.com")
    );
  } finally {
    await cleanup();
  }
});

it("completes onboarding at once for an invited member without invitation:create", async () => {
  auth.session = newUser();
  completeOnboarding();
  organization.activeOrganizationId = "org-2";
  organization.organizations = [
    { id: "org-1", name: "Personal", personal: true },
    { id: "org-2", name: "Acme", personal: false }
  ];
  api.permissions = ["todo:create", "note:create"];
  const { container, cleanup } = await renderOnboarding();
  try {
    await vi.waitFor(() => expect(container.textContent).toBe("/dashboard"));
    expect(api.complete).toHaveBeenCalledTimes(1);
  } finally {
    await cleanup();
  }
});

it("keeps onboarding open after a failed Permissions read and offers the invite step after a retry", async () => {
  auth.session = newUser();
  completeOnboarding();
  organization.activeOrganizationId = "org-2";
  organization.organizations = [
    { id: "org-1", name: "Personal", personal: true },
    { id: "org-2", name: "Acme", personal: false }
  ];
  api.permissions = ["invitation:create"];
  api.permissionsFail = true;
  const { container, cleanup } = await renderOnboarding();
  try {
    await vi.waitFor(() => expect(container.textContent).toContain("auth.onboarding.loadError"));
    expect(api.complete).not.toHaveBeenCalled();

    api.permissionsFail = false;
    await act(async () => button(container, "common.retry").click());

    await vi.waitFor(() => expect(container.textContent).toContain("auth.onboarding.invite.title"));
    expect(container.textContent).not.toContain("auth.onboarding.loadError");
    expect(api.complete).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});
