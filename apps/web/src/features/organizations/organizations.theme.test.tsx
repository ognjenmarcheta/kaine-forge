// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { THEME_NAME_STORAGE_KEY, useApplyOrganizationTheme } from "./organizations.theme";

vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) =>
    document.toString().includes("query OrganizationTheme")
      ? () => Promise.resolve({ organizationTheme: "moss" })
      : () => Promise.reject(new Error("unexpected operation"))
}));

function Shell({ organizationId }: { organizationId: string | null }) {
  useApplyOrganizationTheme(organizationId);
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function render(organizationId: string | null) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Shell organizationId={organizationId} />
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  root = createRoot(container);
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

afterEach(() => {
  act(() => root.unmount());
});

it("applies the Active Organization's theme and caches it for the next first paint", async () => {
  await render("org-1");

  expect(document.documentElement.dataset["theme"]).toBe("moss");
  expect(localStorage.getItem(THEME_NAME_STORAGE_KEY)).toBe("moss");
});

it("goes back to the default theme when the shell signs out", async () => {
  await render("org-1");
  await render(null);

  expect(document.documentElement.dataset["theme"]).toBeUndefined();
  expect(localStorage.getItem(THEME_NAME_STORAGE_KEY)).toBeNull();
});
