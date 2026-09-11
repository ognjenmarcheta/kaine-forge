// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { OrganizationsRoute } from "./organizations.route";

const members = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: "test-organization",
    isLoading: false,
    organizationsVisible: false
  })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../lib/auth-api", () => ({ listOrganizationMembersRequest: members }));

it("redirects hidden Members routes without requesting membership data", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const destination = "dashboard.title";
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/members"]}>
            <Routes>
              <Route path="/members" element={<OrganizationsRoute />} />
              <Route path="/dashboard" element={<p>{destination}</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      )
    );
    expect(container.textContent).toBe(destination);
    expect(members).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});
