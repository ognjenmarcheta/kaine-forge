// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { OrganizationRoles } from "./organization-roles";

const api = vi.hoisted(() => ({
  createCustomRole: vi.fn(() => Promise.resolve()),
  listCustomRoles: vi.fn(() =>
    Promise.resolve([{ id: "role-1", name: "editor", permissions: ["note:create"] }])
  )
}));

vi.mock("../../../lib/auth-api", () => ({ authTransport: {}, organizationApi: api }));
vi.mock("../../../hooks/use-organization", () => ({
  useOrganization: () => ({ activeOrganizationId: "org-1" })
}));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no ResizeObserver; the Radix checkbox measures itself with one.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    }
  );
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

function checkbox(article: Element, label: string): HTMLElement | null {
  const row = Array.from(article.querySelectorAll("label")).find(
    (candidate) => candidate.textContent === label
  );
  return row?.querySelector("button[role='checkbox']") ?? null;
}

it("shows each Custom Role with the permissions it grants", async () => {
  await render(<OrganizationRoles />);
  const role = container.querySelector("article");

  expect(role?.querySelector("h3")?.textContent).toBe("editor");
  expect(
    role && checkbox(role, "organizations.permission.note.create")?.getAttribute("aria-checked")
  ).toBe("true");
  expect(
    role && checkbox(role, "organizations.permission.note.delete")?.getAttribute("aria-checked")
  ).toBe("false");
});

it("offers no owner-only permission in the Custom Role editor", async () => {
  await render(<OrganizationRoles />);
  const labels = Array.from(container.querySelectorAll("form label"), (label) => label.textContent);

  expect(labels).toContain("organizations.permission.organization.update");
  expect(labels).not.toContain("organizations.permission.organization.delete");
  expect(labels).not.toContain("organizations.permission.organization.transfer");
  expect(labels).not.toContain("organizations.permission.ac.create");
});

it("creates a Custom Role from a lowercased name and the checked permissions", async () => {
  await render(<OrganizationRoles />);
  const form = container.querySelector("form");
  const input = form?.querySelector("input");
  if (!form || !input) throw new Error("expected the create form");

  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(input, "Reviewer");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => checkbox(form, "organizations.permission.todo.delete")?.click());
  await act(async () => form.requestSubmit());

  expect(api.createCustomRole).toHaveBeenCalledWith(
    { name: "reviewer", permissions: ["todo:delete"] },
    expect.anything()
  );
});
