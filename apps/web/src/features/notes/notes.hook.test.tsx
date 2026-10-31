// @vitest-environment jsdom
import type { SyncEngine, SyncNote } from "@repo/sync";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useNotes } from "./notes.hook";
import { canSaveNote, isNoteDirty } from "./notes.util";
import {
  createFakeSyncServer,
  createTestSyncEngine,
  type FakeSyncServer
} from "../../lib/sync.testing";

let engine: SyncEngine;
let server: FakeSyncServer;
vi.mock("../../hooks/use-sync", () => ({
  useSyncEngine: () => engine,
  useSyncStatus: () => engine.getStatus()
}));
vi.mock("../../hooks/use-subscription", () => ({ useSubscription: () => {} }));

function note(id: string): SyncNote {
  return {
    id,
    title: `Note ${id}`,
    body: "",
    createdAt: `2026-09-13T12:00:${id.length > 2 ? "00" : "59"}Z`,
    updatedAt: "2026-09-13T12:00:00Z"
  };
}

let current: ReturnType<typeof useNotes>;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let container: HTMLDivElement;
function Harness({ selected }: { selected: string | null }) {
  current = useNotes("one", true, selected);
  return null;
}
async function render(selected: string | null = "a") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness selected={selected} />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await engine.ready;
  });
}
async function edit(value: string, key = "a", field: "title" | "body" = "body") {
  await act(async () => current.edit(key, field, value));
}
async function settle() {
  await act(async () => {
    await vi.waitFor(() => expect(engine.getStatus().pending).toBe(0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server = createFakeSyncServer();
  server.notes.set("a", note("a"));
  server.notes.set("b", note("b"));
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

it("creates only on Save, validates the title, and saves normalized fields with a client id", async () => {
  await render("new");
  await edit(" ", "new", "title");
  await act(async () => current.save("new"));
  await edit("x".repeat(256), "new", "title");
  expect(current.draft && canSaveNote(current.draft)).toBe(false);
  await edit(" New title ", "new", "title");
  await edit(" Body ", "new");
  await act(async () => current.save("new"));

  expect(current.draft).toMatchObject({ title: "New title", body: "Body", status: "saved" });
  const id = current.draft?.serverId;
  expect(id).toEqual(expect.any(String));
  await settle();
  expect(server.pushed).toEqual([[{ noteCreate: { id, title: "New title", body: "Body" } }]]);
  // The server stores what the draft shows, so the synced row is not a change elsewhere.
  expect(current.externalChange).toBe(false);
});

it("keeps each draft while switching between notes, the list, and new note", async () => {
  await render();
  await edit("First draft");
  await render("b");
  await edit("Second draft", "b");
  await render("new");
  await edit("New draft", "new", "title");
  await render(null);
  expect(current.unsaved).toHaveLength(3);
  await render("a");
  expect(current.draft?.body).toBe("First draft");
  await render("b");
  expect(current.draft?.body).toBe("Second draft");
});

it("keeps edits made after a save as unsaved, against the saved revision", async () => {
  await render();
  await edit("Submitted");
  await act(async () => current.save("a"));
  await edit("Newer draft");
  await settle();

  // Only the changed field goes to the server: another user's title edit survives.
  expect(server.pushed).toEqual([[{ noteUpdate: { id: "a", body: "Submitted" } }]]);
  expect(current.draft).toMatchObject({ body: "Newer draft", baseBody: "Submitted" });
  expect(current.draft && isNoteDirty(current.draft)).toBe(true);
});

it("preserves edits on external updates and reloads only on explicit action", async () => {
  await render();
  await edit("Local draft");
  server.notes.set("a", { ...note("a"), body: "Changed elsewhere" });
  await act(async () => current.refresh());

  expect(current.externalChange).toBe(true);
  expect(current.draft?.body).toBe("Local draft");
  await act(async () => current.loadLatest());
  expect(current.draft?.body).toBe("Changed elsewhere");
  expect(current.externalChange).toBe(false);
});

it("keeps a deleted note's draft and sends no update", async () => {
  await render();
  await edit("Recover this");
  server.notes.delete("a");
  server.deleted.push({ entity: "NOTE", id: "a" });
  await act(async () => current.refresh());
  await act(async () => current.save("a"));
  await settle();

  expect(server.pushed).toEqual([]);
  expect(current.draft).toMatchObject({ body: "Recover this", deleted: true });
});

it("lists a Note's checklist from the synced Todos, newest first", async () => {
  await render("a");
  await act(async () => {
    await engine.createTodo({ title: "First item", noteId: "a" });
    await engine.createTodo({ title: "Second item", noteId: "a" });
    await engine.createTodo({ title: "Elsewhere", noteId: "b" });
  });
  // The server's creation times order the checklist, not the device's clock.
  await settle();

  expect(current.detail.data?.note?.todos.map((todo) => todo.title)).toEqual([
    "Second item",
    "First item"
  ]);
});

it("debounces search, pages the local rows, and keeps the current draft", async () => {
  for (let index = 0; index < 55; index++)
    server.notes.set(`extra-${index}`, note(`extra-${index}`));
  await render();
  expect(current.rows).toHaveLength(50);
  await act(async () => current.list.fetchNextPage());
  expect(current.rows).toHaveLength(57);
  expect(current.list.hasNextPage).toBe(false);
  await edit("Local draft");
  await act(async () => {
    current.setSearch("Note b");
  });
  expect(current.phrase).toBe("");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
  expect(current.rows.map((row) => row.id)).toEqual(["b"]);
  expect(current.draft?.body).toBe("Local draft");
});
