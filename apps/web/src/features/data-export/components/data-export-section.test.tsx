// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GraphQLError } from "graphql";
import { ClientError } from "graphql-request";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DataExportSection } from "./data-export-section";

const api = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  requestError: null as Error | null,
  downloadUrl: "https://storage.example.test/export.zip?signature=1"
}));

const READY = {
  id: "export-1",
  kind: "user",
  status: "ready",
  sizeBytes: 2048,
  failureReason: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  completedAt: "2026-10-20T10:01:00.000Z",
  expiresAt: "2026-10-27T10:01:00.000Z"
};

vi.mock("../../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const source = document.toString();

    if (source.includes("mutation RequestDataExport")) {
      return () =>
        api.requestError
          ? Promise.reject(api.requestError)
          : Promise.resolve({ requestDataExport: { id: "export-2", status: "pending" } });
    }

    if (source.includes("mutation DataExportDownloadUrl")) {
      return () => Promise.resolve({ dataExportDownloadUrl: api.downloadUrl });
    }

    return () =>
      Promise.resolve({
        dataExports: { items: api.items, pageInfo: { endCursor: null, hasNextPage: false } }
      });
  }
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
  api.items = [];
  api.requestError = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <DataExportSection kind="user" organizationId={null} />
      </QueryClientProvider>
    )
  );
  await settle();
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label
  );
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

it("downloads a ready export through its presigned URL", async () => {
  api.items = [READY];
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  await render();

  expect(container.querySelector("li")?.textContent).toContain("dataExport.status.ready");
  await act(async () => button("dataExport.download").click());
  await settle();

  expect(assign).toHaveBeenCalledWith(api.downloadUrl);
});

it("explains why a failed export failed", async () => {
  api.items = [
    { ...READY, status: "failed", failureReason: "too_large", expiresAt: null, sizeBytes: null }
  ];
  await render();

  expect(container.querySelector("li")?.textContent).toContain("dataExport.failure.too_large");
  expect(container.textContent).not.toContain("dataExport.download");
});

it("offers no new request while an export is in progress", async () => {
  api.items = [{ ...READY, status: "running", expiresAt: null, sizeBytes: null }];
  await render();

  expect(button("dataExport.request").disabled).toBe(true);
  expect(container.textContent).not.toContain("dataExport.download");
});

it("explains a refused request when another export is still in progress", async () => {
  api.requestError = new ClientError(
    {
      status: 200,
      headers: new Headers(),
      body: "",
      errors: [
        new GraphQLError("a data export of this kind is already in progress", {
          extensions: { code: "DATA_EXPORT_IN_PROGRESS" }
        })
      ]
    },
    { query: "mutation RequestDataExport" }
  );
  await render();

  await act(async () => button("dataExport.request").click());
  await settle();

  expect(container.textContent).toContain("dataExport.error.inProgress");
});
