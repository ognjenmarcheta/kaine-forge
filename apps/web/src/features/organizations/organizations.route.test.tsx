// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { OrganizationsRoute } from "./organizations.route";

const members = vi.hoisted(() => vi.fn());
const organization = vi.hoisted(() => ({ isLoading: false }));
vi.mock("../../hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: "test-organization",
    isLoading: organization.isLoading,
    organizations: [],
    organizationsVisible: false
  })
}));
vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../lib/auth-api", () => ({
  authTransport: {},
  listOrganizationMembersRequest: members,
  organizationApi: {}
}));

async function renderMembersRoute(): Promise<string | null> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/members"]}>
            <Routes>
              <Route path="/members" element={<OrganizationsRoute />} />
              <Route path="/dashboard" element={<p>{DESTINATION}</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    );
    return container.textContent;
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
}

const DESTINATION = "dashboard.title";

it("redirects hidden Members routes without requesting membership data", async () => {
  organization.isLoading = false;

  expect(await renderMembersRoute()).toBe(DESTINATION);
  expect(members).not.toHaveBeenCalled();
});

it("waits instead of redirecting while the Organization state and flags load", async () => {
  organization.isLoading = true;

  expect(await renderMembersRoute()).toBe("organizations.members.loading");
  expect(members).not.toHaveBeenCalled();
});
