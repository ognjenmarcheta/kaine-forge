// @vitest-environment jsdom
import type { SyncEngine, SyncTodo } from "@repo/sync";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useTodos } from "./todos.hook";
import type {
  GenerateTodosMutation,
  GenerateTodosMutationVariables
} from "../../graphql/generated/react-query";
import {
  createFakeSyncServer,
  createTestSyncEngine,
  type FakeSyncServer
} from "../../lib/sync.testing";

const generate = vi.hoisted(() =>
  vi.fn<(variables: GenerateTodosMutationVariables) => Promise<GenerateTodosMutation>>()
);
let engine: SyncEngine;
let server: FakeSyncServer;
vi.mock("../../hooks/use-sync", () => ({
  useSyncEngine: () => engine,
  useSyncStatus: () => engine.getStatus()
}));
vi.mock("../../hooks/use-subscription", () => ({ useSubscription: () => {} }));
vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: () => generate
}));

function todo(id = "a", fields: Partial<SyncTodo> = {}): SyncTodo {
  return {
    id,
    title: `Todo ${id}`,
    description: "Description",
    completed: false,
    noteId: null,
    attachments: [],
    createdAt: `2026-09-13T12:00:${id.padStart(2, "0").slice(-2)}Z`,
    updatedAt: "2026-09-13T12:00:00Z",
    ...fields
  };
}

let current: ReturnType<typeof useTodos>;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let container: HTMLDivElement;
function Harness({ search, status }: { search: string; status: string }) {
  current = useTodos("one", true, search, status);
  return null;
}
async function render(search = "", status = "all") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness search={search} status={status} />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await engine.ready;
  });
}
async function settle() {
  await act(async () => {
    await vi.waitFor(() => expect(engine.getStatus().pending).toBe(0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server = createFakeSyncServer();
  server.todos.set("a", todo("a"));
  engine = createTestSyncEngine(server);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  engine.dispose();
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("validates quick creation, sends the normalized Todo once, and shows it at once", async () => {
  await render();
  for (const title of [" ", "x".repeat(256)]) {
    await act(async () => current.setDraft({ title, description: "" }));
    await act(async () => {
      await current.add();
    });
  }
  await act(async () => current.setDraft({ title: " New ", description: " Details " }));
  await act(async () => {
    await Promise.all([current.add(), current.add()]);
  });

  expect(current.rows.map((row) => row.title)).toContain("New");
  expect(current.draft).toEqual({ title: "", description: "" });
  await settle();
  expect(server.pushed).toEqual([
    [{ todoCreate: { id: expect.any(String), title: "New", description: "Details", noteId: null } }]
  ]);
});

it("keeps quick and edit drafts through searches and status changes", async () => {
  await render();
  await act(async () => {
    current.setDraft({ title: "draft", description: "body" });
    current.openEdit(todo("a"));
  });
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "edited", description: "local" } } : value
    )
  );

  await render("missing", "completed");

  expect(current.rows).toEqual([]);
  expect(current.draft.title).toBe("draft");
  expect(current.editing?.draft.title).toBe("edited");
});

it("sends only the text when saving, and an explicit state when toggling", async () => {
  server.todos.set("a", todo("a", { completed: true }));
  await render();
  await act(async () => current.openEdit(todo("a", { completed: true })));
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "Changed", description: "" } } : value
    )
  );
  await act(async () => {
    await current.save();
  });
  await settle();
  await act(async () => {
    await current.toggle(todo("a", { completed: true }));
  });
  await settle();

  expect(server.pushed).toEqual([
    [{ todoUpdate: { id: "a", title: "Changed", description: null } }],
    // Sets the state the user saw flipped; a replay cannot flip it back.
    [{ todoUpdate: { id: "a", completed: false } }]
  ]);
  expect(current.notice).toBe("todos.markedOpen");
});

it("keeps local text on another user's change and detects a deletion", async () => {
  await render();
  await act(async () => current.openEdit(todo("a")));
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "local", description: "" } } : value
    )
  );
  server.todos.set("a", todo("a", { title: "external" }));
  await act(async () => current.refresh());

  expect(current.externalChange).toBe(true);
  expect(current.editing?.draft.title).toBe("local");
  await act(async () => current.loadLatest());
  expect(current.editing?.draft.title).toBe("external");

  server.todos.delete("a");
  server.deleted.push({ entity: "TODO", id: "a" });
  await act(async () => current.refresh());

  expect(current.editing?.deleted).toBe(true);
  await act(async () => {
    expect(await current.save()).toBe(false);
  });
});

it("filters and pages the local rows, newest first", async () => {
  for (let i = 0; i < 55; i++) server.todos.set(String(i), todo(String(i)));
  server.todos.set("done", todo("done", { completed: true, title: "Finished report" }));
  await render();

  expect(current.rows).toHaveLength(50);
  await act(async () => current.list.fetchNextPage());
  expect(current.rows).toHaveLength(57);
  expect(current.list.hasNextPage).toBe(false);

  await render("REPORT", "completed");
  expect(current.rows.map((row) => row.id)).toEqual(["done"]);
});

it("sends the prompt through the generated AI operation", async () => {
  generate.mockResolvedValue({
    generateTodos: { status: "AI_NOT_CONFIGURED", message: null, todos: [] }
  });
  await render();
  await act(async () => {
    await current.generate("Plan release");
  });
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0]?.[0]).toEqual({ input: { prompt: "Plan release" } });
});
