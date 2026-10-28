// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DashboardOverview } from "./dashboard-overview";

const api = vi.hoisted(() => ({
  permissions: ["audit:read"] as string[],
  openTodos: [] as { id: string; title: string; completed: boolean }[],
  auditEvents: vi.fn()
}));

vi.mock("../../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const query = document.toString();
    const answer = (data: unknown) => () => Promise.resolve(data);
    if (query.includes("query OrganizationPermissions"))
      return () => Promise.resolve({ organizationPermissions: api.permissions });
    if (query.includes("query TodoCounts"))
      return answer({ todoCounts: { open: 3, completed: 2 } });
    if (query.includes("query NoteCount")) return answer({ noteCount: 7 });
    if (query.includes("query Notifications"))
      return answer({
        notifications: {
          items: [],
          unreadCount: 4,
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      });
    if (query.includes("query GetTodos("))
      return () =>
        Promise.resolve({
          todos: { items: api.openTodos, pageInfo: { hasNextPage: false, endCursor: null } }
        });
    if (query.includes("query AuditEvents"))
      return () => {
        api.auditEvents();
        return Promise.resolve({
          auditEvents: { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
        });
      };
    const empty = { items: [], pageInfo: { hasNextPage: false, endCursor: null } };
    if (query.includes("query GetNotes(")) return answer({ notes: empty });
    if (query.includes("query GetConversations")) return answer({ conversations: empty });
    return () => Promise.reject(new Error(`unexpected operation: ${query.slice(0, 40)}`));
  }
}));
vi.mock("../../../hooks/use-subscription", () => ({ useSubscription: () => {} }));
vi.mock("../../../hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganizationId: "org-1",
    isLoading: false,
    organizations: [{ id: "org-1", name: "Example organization", personal: false }],
    organizationsVisible: true
  })
}));
vi.mock("../../../hooks/use-auth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1", name: "Ada Lovelace" } } })
}));
vi.mock("../../../hooks/use-translation", () => ({
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
  api.openTodos = [];
  api.auditEvents.mockClear();
  vi.unstubAllGlobals();
});

async function settleUntil(done: () => boolean) {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function headings(): string[] {
  return Array.from(container.querySelectorAll("h2"), (heading) => heading.textContent ?? "");
}

async function renderDashboard(done: () => boolean) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <DashboardOverview />
        </MemoryRouter>
      </QueryClientProvider>
    )
  );
  await settleUntil(done);
}

it("shows the organization's open todos, note total, and unread notifications", async () => {
  await renderDashboard(() => container.querySelectorAll(".ui-stat-card__value").length === 3);

  const cards = Array.from(container.querySelectorAll(".ui-stat-card"), (card) => ({
    href: card.getAttribute("href"),
    text: card.textContent
  }));
  expect(cards).toEqual([
    { href: "/todos", text: "dashboard.counts.openTodos3" },
    { href: "/notes", text: "dashboard.counts.notes7" },
    { href: null, text: "dashboard.counts.unread4" }
  ]);
});

it("offers to add the first todo when none are open, focusing the quick add", async () => {
  await renderDashboard(() => container.textContent?.includes("dashboard.todos.empty") === true);

  const addFirst = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "dashboard.todos.addFirst"
  );
  await act(async () => addFirst?.click());

  expect(document.activeElement).toBe(container.querySelector("#dashboard-quick-todo"));
});

it.each([
  { permissions: ["audit:read"], shown: true },
  { permissions: ["todo:create", "member:update"], shown: false }
])("shows Recent activity only with audit:read ($permissions)", async ({ permissions, shown }) => {
  api.permissions = permissions;
  await renderDashboard(
    () =>
      client.getQueryState(["OrganizationPermissions", "org-1"])?.status === "success" &&
      client.isFetching() === 0
  );
  // One more tick: the permissions answer re-renders the section and starts any audit read.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  expect(headings().includes("dashboard.activity.title")).toBe(shown);
  expect(api.auditEvents).toHaveBeenCalledTimes(shown ? 1 : 0);
});
