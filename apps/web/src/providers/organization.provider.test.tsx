// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrganizationContext, OrganizationProvider } from "./organization.provider";

// The API's featureFlags answer; each test settles it when it chooses.
const flags = vi.hoisted(() => {
  const state: { settle?: (outcome: { organizationsVisible: boolean } | Error) => void } = {};
  return state;
});
const setActiveOrganization = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    session: { activeOrganizationId: "org-a", user: { id: "user-1" } }
  })
}));
vi.mock("../lib/auth-api", () => ({
  createOrganizationRequest: vi.fn(),
  listOrganizationsRequest: () =>
    Promise.resolve({
      activeOrganizationId: "org-a",
      organizations: [
        { id: "org-a", name: "A" },
        { id: "org-b", name: "B" }
      ]
    }),
  setActiveOrganizationRequest: setActiveOrganization
}));
vi.mock("../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: () => () =>
    new Promise((resolve, reject) => {
      flags.settle = (outcome) =>
        outcome instanceof Error
          ? reject(outcome)
          : resolve({
              featureFlags: [
                { key: "organizations_visible", enabled: outcome.organizationsVisible }
              ]
            });
    })
}));

function Probe() {
  const value = useContext(OrganizationContext);
  const state = `loading:${String(value?.isLoading)} visible:${String(value?.organizationsVisible)}`;
  return <p>{state}</p>;
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // A remembered Organization that differs from the session's Active Organization.
  window.localStorage.setItem("kaine.organization.active", "org-b");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <OrganizationProvider>
          <Probe />
        </OrganizationProvider>
      </QueryClientProvider>
    )
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  window.localStorage.clear();
  setActiveOrganization.mockReset();
  vi.unstubAllGlobals();
});

it("waits for the server's flags before showing organization UI or switching Organization", async () => {
  expect(container.textContent).toBe("loading:true visible:false");
  expect(setActiveOrganization).not.toHaveBeenCalled();

  await act(async () => flags.settle?.({ organizationsVisible: false }));

  expect(container.textContent).toBe("loading:false visible:false");
  expect(setActiveOrganization).not.toHaveBeenCalled();
});

it("keeps organization UI hidden and the remembered Organization unused when the flags fail", async () => {
  await act(async () => flags.settle?.(new Error("network down")));
  // React Query reports a rejection to observers on a later macrotask.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  expect(container.textContent).toBe("loading:false visible:false");
  expect(setActiveOrganization).not.toHaveBeenCalled();
});
