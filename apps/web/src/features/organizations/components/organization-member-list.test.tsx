// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrganizationMemberList } from "./organization-member-list";

vi.mock("../../../lib/auth-api", () => ({ authTransport: {}, organizationApi: {} }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const MEMBERS = [
  { email: "a@example.com", id: "m-1", name: "Ana", role: "editor", userId: "user-2" },
  { email: "o@example.com", id: "m-2", name: "Ola", role: "owner", userId: "user-3" }
];

it("lets member:update change a Custom Role member's role but never an owner's", async () => {
  await render(
    <OrganizationMemberList
      customRoleNames={["editor"]}
      members={MEMBERS}
      ownUserId="user-1"
      permissions={new Set(["member:update"])}
    />
  );

  expect(
    container.querySelector("[aria-label='organizations.role.label: Ana']")?.textContent
  ).toContain("editor");
  expect(container.querySelector("[aria-label='organizations.role.label: Ola']")).toBeNull();
  expect(container.textContent).not.toContain("organizations.members.remove");
});

it("shows roles read-only without member:update", async () => {
  await render(
    <OrganizationMemberList
      customRoleNames={["editor"]}
      members={MEMBERS}
      ownUserId="user-1"
      permissions={new Set(["member:delete", "organization:transfer"])}
    />
  );

  expect(container.querySelector("[aria-label^='organizations.role.label']")).toBeNull();
  expect(container.textContent).toContain("editor");
  expect(container.textContent).toContain("organizations.members.remove");
  expect(container.textContent).toContain("organizations.members.transfer");
});
