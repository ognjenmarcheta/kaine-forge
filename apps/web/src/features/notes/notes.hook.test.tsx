// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useNotes } from "./notes.hook";
import type { NoteDetail } from "./notes.type";
import { canSaveNote, isNoteDirty } from "./notes.util";
import type {
  CreateNoteMutation,
  CreateNoteMutationVariables,
  UpdateNoteMutation,
  UpdateNoteMutationVariables,
  GetNotesQueryVariables
} from "../../graphql/generated/react-query";

const api = vi.hoisted(() => ({
  notes: new Map<string, NoteDetail>(),
  create: vi.fn<(variables: CreateNoteMutationVariables) => Promise<CreateNoteMutation>>(),
  update: vi.fn<(variables: UpdateNoteMutationVariables) => Promise<UpdateNoteMutation>>(),
  remove: vi.fn<() => Promise<{ deleteNote: boolean }>>(),
  search: vi.fn<(variables: GetNotesQueryVariables) => void>(),
  deleted: {
    current: (data: { noteDeleted: { id: string } }) => {
      void data;
    }
  }
}));
vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const query = document.toString();
    if (query.includes("mutation CreateNote")) return api.create;
    if (query.includes("mutation UpdateNote")) return api.update;
    if (query.includes("mutation DeleteNote")) return api.remove;
    if (query.includes("query GetNotes("))
      return (variables: GetNotesQueryVariables) => {
        api.search(variables);
        const search = variables.search?.toLowerCase() ?? "";
        return Promise.resolve({
          notes: [...api.notes.values()]
            .filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(search))
            .slice(variables.offset ?? 0, (variables.offset ?? 0) + (variables.limit ?? 50))
        });
      };
    return ({ id }: { id: string }) => Promise.resolve({ note: api.notes.get(id) ?? null });
  }
}));
vi.mock("../../hooks/use-subscription", () => ({
  useSubscription: ({
    query,
    onData
  }: {
    query: string;
    onData: (data: { noteDeleted: { id: string } }) => void;
  }) => {
    if (query.includes("noteDeleted")) api.deleted.current = onData;
  }
}));

let current: ReturnType<typeof useNotes>;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let container: HTMLDivElement;
function Harness({ selected, organization }: { selected: string | null; organization: string }) {
  current = useNotes(organization, true, selected);
  return null;
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(selected: string | null = "a", organization = "one") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness key={organization} selected={selected} organization={organization} />
      </QueryClientProvider>
    )
  );
  await flush();
}
async function edit(value: string, key = "a", field: "title" | "body" = "body") {
  await act(async () => current.edit(key, field, value));
}
function note(id: string): NoteDetail {
  return {
    id,
    title: `Note ${id}`,
    body: `Body ${id}`,
    createdAt: "2026-09-13T10:00:00Z",
    updatedAt: "2026-09-13T10:00:00Z",
    todos: []
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.notes.clear();
  api.notes.set("a", note("a"));
  api.notes.set("b", note("b"));
  api.create.mockImplementation(async ({ input }) => {
    const saved = {
      ...note("created"),
      title: input.title.trim(),
      body: input.body?.trim() ?? null
    };
    api.notes.set(saved.id, saved);
    return { createNote: saved };
  });
  api.update.mockImplementation(async ({ id, input }) => {
    const saved = {
      ...note(String(id)),
      title: input.title?.trim() ?? "",
      body: input.body?.trim() ?? null
    };
    api.notes.set(String(id), saved);
    return { updateNote: saved };
  });
  api.remove.mockResolvedValue({ deleteNote: true });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("creates only on Save, validates the title, and normalizes the saved fields", async () => {
  await render("new");
  expect(api.create).not.toHaveBeenCalled();
  await edit(" ", "new", "title");
  await act(async () => current.save("new"));
  expect(api.create).not.toHaveBeenCalled();
  await edit("x".repeat(256), "new", "title");
  expect(current.draft && canSaveNote(current.draft)).toBe(false);
  await edit(" New title ", "new", "title");
  await edit(" Body ", "new");
  await act(async () => current.save("new"));
  expect(api.create).toHaveBeenCalledOnce();
  expect(current.draft).toMatchObject({
    title: "New title",
    body: "Body",
    serverId: "created",
    status: "saved"
  });
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

it("saves its originating revision without overwriting newer edits or the selected note", async () => {
  await render();
  await edit("Submitted");
  const request = deferred<UpdateNoteMutation>();
  api.update.mockReturnValueOnce(request.promise);
  let saving: Promise<void>;
  await act(async () => {
    saving = current.save("a");
  });
  await act(async () => current.save("a"));
  expect(api.update).toHaveBeenCalledOnce();
  await edit("Newer draft");
  await render("b");
  await edit("Other draft", "b");
  const saved = { ...note("a"), body: "Submitted" };
  api.notes.set("a", saved);
  await act(async () => {
    request.resolve({ updateNote: saved });
    await saving;
  });
  expect(current.draft?.body).toBe("Other draft");
  expect(current.drafts["a"]).toMatchObject({ body: "Newer draft", baseBody: "Submitted" });
  expect(current.drafts["a"] && isNoteDirty(current.drafts["a"])).toBe(true);
});

it("keeps a failed prompt and newer edits without automatically retrying", async () => {
  await render();
  await edit("Keep this draft");
  api.update.mockRejectedValueOnce(new Error("Unavailable"));
  await act(async () => current.save("a"));
  expect(current.draft).toMatchObject({ body: "Keep this draft", status: "error" });
  await edit("Edited after failure");
  await render("b");
  await render("a");
  expect(api.update).toHaveBeenCalledOnce();
  expect(current.draft?.status).toBe("error");
  await act(async () => current.save("a"));
  expect(current.draft).toMatchObject({ body: "Edited after failure", status: "saved" });
});

it("retains an uncertain new draft without creating another note automatically", async () => {
  await render("new");
  await edit("Uncertain", "new", "title");
  api.create.mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => current.save("new"));
  await render("b");
  await render("new");
  expect(current.draft).toMatchObject({ title: "Uncertain", status: "error", serverId: null });
  expect(api.create).toHaveBeenCalledOnce();
});

it("ignores a late completion after an Organization reset", async () => {
  await render();
  await edit("Old organization");
  const request = deferred<UpdateNoteMutation>();
  api.update.mockReturnValueOnce(request.promise);
  let saving: Promise<void>;
  await act(async () => {
    saving = current.save("a");
  });
  await render("a", "two");
  await edit("Current organization");
  await act(async () => {
    request.resolve({ updateNote: note("a") });
    await saving;
  });
  expect(current.draft?.body).toBe("Current organization");
  expect(current.pending).toBe(false);
});

it("preserves edits on external updates and reloads only on explicit action", async () => {
  await render();
  await edit("Local draft");
  api.notes.set("a", { ...note("a"), body: "Changed elsewhere" });
  await act(async () => current.refresh());
  await flush();
  expect(current.externalChange).toBe(true);
  expect(current.draft?.body).toBe("Local draft");
  await act(async () => current.loadLatest());
  expect(current.draft?.body).toBe("Changed elsewhere");
  expect(current.externalChange).toBe(false);
});

it("retains a deleted note's draft and prevents sending an update", async () => {
  await render();
  await edit("Recover this");
  await act(async () => api.deleted.current({ noteDeleted: { id: "a" } }));
  await act(async () => current.save("a"));
  expect(api.update).not.toHaveBeenCalled();
  expect(current.draft).toMatchObject({ body: "Recover this", deleted: true });
});

it("debounces search, loads another page, and keeps the current draft", async () => {
  for (let index = 0; index < 55; index++) api.notes.set(`extra-${index}`, note(`extra-${index}`));
  await render();
  expect(current.rows).toHaveLength(50);
  await act(async () => current.list.fetchNextPage());
  await flush();
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
  await flush();
  expect(current.rows.map((row) => row.id)).toEqual(["b"]);
  expect(current.draft?.body).toBe("Local draft");
});
