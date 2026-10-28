// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuditLogRoute } from "./audit.route";
import type { AuditEventsQueryVariables } from "../../graphql/generated/react-query";

const api = vi.hoisted(() => ({
  permissions: ["audit:read"] as string[] | undefined,
  pages: vi.fn<(variables: AuditEventsQueryVariables) => void>(),
  // Holds the second page until the test releases it.
  nextPage: Promise.resolve()
}));

const FIRST_EVENT = {
  action: "member_invited",
  actor: { email: "owner@example.com", id: "user-1", name: "Owner" },
  createdAt: "2026-10-27T10:00:00.000Z",
  id: "event-2",
  ipAddress: "203.0.113.9",
  targetLabel: "invitee@example.com",
  targetType: "invitation"
};
const SECOND_EVENT = {
  action: "attachment_deleted",
  actor: null,
  createdAt: "2026-10-26T10:00:00.000Z",
  id: "event-1",
  ipAddress: null,
  targetLabel: "report.pdf",
  targetType: "attachment"
};

vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    if (document.toString().includes("query OrganizationPermissions")) {
      return () => Promise.resolve({ organizationPermissions: api.permissions });
    }

    return async (variables: AuditEventsQueryVariables) => {
      api.pages(variables);
      if (variables.after) await api.nextPage;
      return {
        auditEvents: variables.after
          ? { items: [SECOND_EVENT], pageInfo: { endCursor: "cursor-2", hasNextPage: false } }
          : { items: [FIRST_EVENT], pageInfo: { endCursor: "cursor-1", hasNextPage: true } }
      };
    };
  }
}));
vi.mock("../../hooks/use-organization", () => ({
  useOrganization: () => ({ activeOrganizationId: "org-1" })
}));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  api.permissions = ["audit:read"];
  api.pages.mockClear();
  api.nextPage = Promise.resolve();
  vi.unstubAllGlobals();
});

const DASHBOARD = "dashboard";

// The permissions query and then the events query resolve on later ticks; wait for
// what the test needs instead of a fixed delay that a loaded machine misses.
async function settleUntil(done: () => boolean) {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function renderRoute() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/audit-log"]}>
          <Routes>
            <Route path="/audit-log" element={<AuditLogRoute />} />
            <Route path="/dashboard" element={<p>{DASHBOARD}</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  );
  await settleUntil(() => rowTexts().length > 0 || container.textContent === DASHBOARD);
}

function rowTexts(): string[] {
  return Array.from(container.querySelectorAll("li"), (row) => row.textContent ?? "");
}

it("lists each event's actor, translated action, target, IP, and time, then loads the next page", async () => {
  let releaseNextPage = () => {};
  api.nextPage = new Promise((resolve) => {
    releaseNextPage = resolve;
  });
  await renderRoute();

  expect(rowTexts()).toEqual([
    expect.stringMatching(
      /^organizations\.audit\.actor Owner \(owner@example\.com\) organizations\.audit\.action\.member_invited organizations\.audit\.target invitee@example\.com organizations\.audit\.ipAddress 203\.0\.113\.9organizations\.audit\.time .+$/
    )
  ]);

  const loadMore = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "organizations.audit.loadMore"
  );
  await act(async () => loadMore?.click());
  await settleUntil(() => loadMore?.textContent === "organizations.audit.loading");

  expect(loadMore?.textContent).toBe("organizations.audit.loading");
  expect(loadMore?.disabled).toBe(true);

  releaseNextPage();
  await settleUntil(() => rowTexts().length > 1);

  expect(api.pages).toHaveBeenLastCalledWith({ after: "cursor-1", first: 20 });
  expect(rowTexts()[1]).toMatch(
    /^organizations\.audit\.actor organizations\.audit\.unknownActor organizations\.audit\.action\.attachment_deleted organizations\.audit\.target report\.pdf organizations\.audit\.time /
  );
  expect(container.textContent).not.toContain("organizations.audit.loadMore");
});

it("sends a member without audit:read to the dashboard without reading the audit log", async () => {
  api.permissions = ["todo:create", "member:update"];
  await renderRoute();

  expect(container.textContent).toBe(DASHBOARD);
  expect(api.pages).not.toHaveBeenCalled();
});

it("sends the session to the dashboard when the permissions answer has no list", async () => {
  api.permissions = undefined;
  await renderRoute();

  expect(container.textContent).toBe(DASHBOARD);
  expect(api.pages).not.toHaveBeenCalled();
});
