// @vitest-environment jsdom
import { AuthRequestError } from "@repo/auth/transport";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { OrganizationInvitationRoute } from "./organizations.invitation.route";

const { auth, getInvitation } = vi.hoisted(() => ({
  auth: { session: null as { user: { id: string } } | null },
  getInvitation: vi.fn()
}));

vi.mock("../../hooks/use-auth", () => ({
  useAuth: () => ({ isLoading: false, session: auth.session })
}));
vi.mock("../../hooks/use-organization", () => ({
  useOrganization: () => ({ applyOrganizationSession: vi.fn() })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../lib/auth-api", () => ({ organizationApi: { getInvitation } }));

function AuthPage() {
  const location = useLocation();
  const url = location.pathname + location.search;
  return <p>{url}</p>;
}

async function renderInvitation() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/invitations/inv-1"]}>
          <Routes>
            <Route path="/invitations/:invitationId" element={<OrganizationInvitationRoute />} />
            <Route path="/auth" element={<AuthPage />} />
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

afterEach(() => {
  vi.unstubAllGlobals();
  getInvitation.mockReset();
});

it("sends a signed-out visitor to sign in and back to the invitation", async () => {
  auth.session = null;
  const { container, cleanup } = await renderInvitation();
  try {
    expect(container.textContent).toBe("/auth?redirect=%2Finvitations%2Finv-1");
    expect(getInvitation).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});

it("tells a user with another email address and offers no accept button", async () => {
  auth.session = { user: { id: "user-1" } };
  getInvitation.mockRejectedValue(
    new AuthRequestError({ code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", status: 403 })
  );
  const { container, cleanup } = await renderInvitation();
  try {
    await vi.waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        "organizations.invitation.wrongEmail"
      )
    );
    expect(container.textContent).not.toContain("organizations.invitation.accept");
  } finally {
    await cleanup();
  }
});
