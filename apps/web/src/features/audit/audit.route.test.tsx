// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AuditLogRoute } from "./audit.route";
import type { AuditEventsQueryVariables } from "../../graphql/generated/react-query";

const api = vi.hoisted(() => ({
  role: "admin",
  pages: vi.fn<(variables: AuditEventsQueryVariables) => void>()
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
    if (document.toString().includes("query CurrentOrganizationRole")) {
      return () => Promise.resolve({ currentOrganization: { id: "org-1", role: api.role } });
    }

    return (variables: AuditEventsQueryVariables) => {
      api.pages(variables);
      return Promise.resolve({
        auditEvents: variables.after
          ? { endCursor: "cursor-2", events: [SECOND_EVENT], hasNextPage: false }
          : { endCursor: "cursor-1", events: [FIRST_EVENT], hasNextPage: true }
      });
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
  api.role = "admin";
  api.pages.mockClear();
  vi.unstubAllGlobals();
});

const DASHBOARD = "dashboard";

// The role query and then the events query resolve on later ticks; wait for
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

it("lists each event's translated action, actor, target, and IP, then loads the next page", async () => {
  await renderRoute();

  expect(rowTexts()).toEqual([
    expect.stringMatching(
      /^organizations\.audit\.action\.member_invitedorganizations\.audit\.actorOwner \(owner@example\.com\)organizations\.audit\.targetinvitee@example\.comorganizations\.audit\.time.+organizations\.audit\.ipAddress203\.0\.113\.9$/
    )
  ]);

  const loadMore = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "organizations.audit.loadMore"
  );
  await act(async () => loadMore?.click());
  await settleUntil(() => rowTexts().length > 1);

  expect(api.pages).toHaveBeenLastCalledWith({ after: "cursor-1", first: 20 });
  expect(rowTexts()[1]).toMatch(
    /^organizations\.audit\.action\.attachment_deletedorganizations\.audit\.actororganizations\.audit\.unknownActororganizations\.audit\.targetreport\.pdforganizations\.audit\.time/
  );
  expect(container.textContent).not.toContain("organizations.audit.loadMore");
});

it("sends a member to the dashboard without reading the audit log", async () => {
  api.role = "member";
  await renderRoute();

  expect(container.textContent).toBe(DASHBOARD);
  expect(api.pages).not.toHaveBeenCalled();
});
