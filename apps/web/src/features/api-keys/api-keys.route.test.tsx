// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiKeysRoute } from "./api-keys.route";

const PLAIN_KEY = "kf_PlainKeyShownOnlyOnce0123456789";
const LISTED_KEY = {
  createdAt: "2026-10-27T10:00:00.000Z",
  createdBy: { email: "owner@example.com", id: "user-1", name: "Owner" },
  expiresAt: null,
  id: "key-1",
  lastUsedAt: null,
  name: "CI",
  prefix: "kf_Plai"
};

const api = vi.hoisted(() => ({ keys: [] as unknown[] }));

vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const operation = document.toString();
    if (operation.includes("query OrganizationPermissions")) {
      return () =>
        Promise.resolve({
          organizationPermissions: ["apiKey:read", "apiKey:create", "apiKey:delete"]
        });
    }
    if (operation.includes("mutation CreateApiKey")) {
      return () => {
        api.keys = [LISTED_KEY];
        return Promise.resolve({ createApiKey: { apiKey: LISTED_KEY, key: PLAIN_KEY } });
      };
    }
    return () =>
      Promise.resolve({
        apiKeys: { items: api.keys, pageInfo: { endCursor: null, hasNextPage: false } }
      });
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
  api.keys = [];
  vi.unstubAllGlobals();
});

async function settleUntil(done: () => boolean) {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function list() {
  return container.querySelector('ul[aria-label="organizations.apiKeys.title"]');
}

it("shows the new plain key once and lists the key by its prefix only", async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ApiKeysRoute />
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  await settleUntil(() => container.querySelector("form") !== null);

  const name = container.querySelector<HTMLInputElement>("form input");
  if (!name) throw new Error("expected the name field");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(name, "CI");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container.querySelector("form")?.requestSubmit();
  });
  await settleUntil(() => list() !== null);

  const shown = Array.from(container.querySelectorAll<HTMLInputElement>("input[readonly]"));
  expect(shown.map((input) => input.value)).toEqual([PLAIN_KEY]);
  expect(list()?.textContent).toContain("kf_Plai");
  expect(list()?.textContent).not.toContain(PLAIN_KEY);
});
