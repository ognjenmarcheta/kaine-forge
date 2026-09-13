// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useTodos } from "./todos.hook";
import type { TodoItem } from "./todos.type";
import type {
  CreateTodoMutationVariables,
  UpdateTodoMutationVariables,
  GetTodosQueryVariables
} from "../../graphql/generated/react-query";

const api = vi.hoisted(() => ({
  rows: new Map<string, TodoItem>(),
  create: vi.fn<(variables: CreateTodoMutationVariables) => Promise<{ createTodo: TodoItem }>>(),
  update: vi.fn<(variables: UpdateTodoMutationVariables) => Promise<{ updateTodo: TodoItem }>>(),
  generate: vi.fn<() => Promise<{ generateTodos: { status: string; todos: TodoItem[] } }>>(),
  searches: vi.fn<(variables: GetTodosQueryVariables) => void>()
}));
vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const query = document.toString();
    if (query.includes("mutation CreateTodo")) return api.create;
    if (query.includes("mutation UpdateTodo")) return api.update;
    if (query.includes("mutation GenerateTodos")) return api.generate;
    if (query.includes("query GetTodos("))
      return (variables: GetTodosQueryVariables) => {
        api.searches(variables);
        return Promise.resolve({
          todos: [...api.rows.values()]
            .filter(
              (item) =>
                `${item.title} ${item.description}`
                  .toLowerCase()
                  .includes(variables.search?.toLowerCase() ?? "") &&
                (variables.completed == null || item.completed === variables.completed)
            )
            .slice(variables.offset ?? 0, (variables.offset ?? 0) + 50)
        });
      };
    return ({ id }: { id: string }) => Promise.resolve({ todo: api.rows.get(id) ?? null });
  }
}));
vi.mock("../../hooks/use-subscription", () => ({ useSubscription: () => {} }));
let current: ReturnType<typeof useTodos>;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
let container: HTMLDivElement;
function Harness({
  organization,
  search,
  status
}: {
  organization: string;
  search: string;
  status: string;
}) {
  current = useTodos(organization, true, search, status);
  return null;
}
function todo(id = "a"): TodoItem {
  return {
    id,
    title: `Todo ${id}`,
    description: "Description",
    completed: false,
    attachments: [],
    createdAt: "2026-09-13T12:00:00Z",
    updatedAt: "2026-09-13T12:00:00Z"
  };
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(organization = "one", search = "", status = "all") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness key={organization} organization={organization} search={search} status={status} />
      </QueryClientProvider>
    )
  );
  await flush();
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  api.searches.mockReset();
  api.rows.clear();
  api.rows.set("a", todo());
  api.create.mockImplementation(async ({ input }) => ({
    createTodo: { ...todo("new"), title: input.title, description: input.description ?? null }
  }));
  api.update.mockImplementation(async ({ id, input }) => {
    const previous = api.rows.get(String(id)) ?? todo(String(id));
    const saved = {
      ...previous,
      title: input.title ?? previous.title,
      description: input.description === undefined ? previous.description : input.description,
      completed: input.completed ?? previous.completed
    };
    api.rows.set(String(id), saved);
    return { updateTodo: saved };
  });
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

it("validates quick creation and submits normalized title and shared description once", async () => {
  await render();
  await act(async () => {
    current.setDraft({ title: " ", description: "" });
  });
  await act(async () => {
    await current.add();
  });
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => {
    current.setDraft({ title: "x".repeat(256), description: "" });
  });
  await act(async () => {
    await current.add();
  });
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => {
    current.setDraft({ title: " New ", description: " Details " });
  });
  await act(async () => {
    await Promise.all([current.add(), current.add()]);
  });
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(api.create.mock.calls[0]?.[0]).toEqual({
    input: { title: "New", description: "Details" }
  });
  expect(current.draft).toEqual({ title: "", description: "" });
});
it("preserves failed drafts and only retries when asked", async () => {
  await render();
  api.create.mockRejectedValueOnce(new Error("offline"));
  await act(async () => current.setDraft({ title: "Keep me", description: "body" }));
  await act(async () => current.add());
  await flush();
  expect(current.draft.title).toBe("Keep me");
  expect(current.errors.create).toBe("todos.createUncertain");
  expect(api.create).toHaveBeenCalledTimes(1);
  await act(async () => current.add());
  expect(current.draft.title).toBe("");
});
it("keeps quick and edit drafts through searches and status changes", async () => {
  await render();
  await act(async () => {
    current.setDraft({ title: "draft", description: "body" });
    current.openEdit(todo());
  });
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "edited", description: "local" } } : value
    )
  );
  await render("one", "missing", "completed");
  expect(current.rows).toEqual([]);
  expect(current.draft.title).toBe("draft");
  expect(current.editing?.draft.title).toBe("edited");
  expect(api.searches).toHaveBeenLastCalledWith({
    search: "missing",
    completed: true,
    limit: 50,
    offset: 0
  });
});
it("does not overwrite completion when saving text", async () => {
  await render();
  await act(async () => current.openEdit(todo()));
  api.rows.set("a", { ...todo(), completed: true });
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "Changed", description: "" } } : value
    )
  );
  await act(async () => current.save());
  expect(api.update.mock.calls[0]?.[0]).toEqual({
    id: "a",
    input: { title: "Changed", description: null }
  });
  expect(api.rows.get("a")?.completed).toBe(true);
});
it("uses an explicit completion state, locks the row, and waits for confirmation", async () => {
  await render();
  const held = deferred<{ updateTodo: TodoItem }>();
  api.update.mockReturnValueOnce(held.promise);
  await act(async () => {
    void current.toggle(todo());
    void current.toggle(todo());
  });
  expect(current.pending).toContain("a");
  expect(current.rows[0]?.completed).toBe(false);
  expect(api.update).toHaveBeenCalledTimes(1);
  expect(api.update.mock.calls[0]?.[0]).toEqual({ id: "a", input: { completed: true } });
  await act(async () => held.resolve({ updateTodo: { ...todo(), completed: true } }));
  expect(current.pending).toEqual([]);
});
it("ignores late creation after Organization reset", async () => {
  await render();
  const held = deferred<{ createTodo: TodoItem }>();
  api.create.mockReturnValueOnce(held.promise);
  await act(async () => current.setDraft({ title: "old", description: "" }));
  await act(async () => {
    void current.add();
  });
  await render("two");
  await act(async () => current.setDraft({ title: "new Organization", description: "" }));
  await act(async () => held.resolve({ createTodo: todo("old") }));
  expect(current.draft.title).toBe("new Organization");
  expect(current.notice).toBe("");
  expect(current.pending).toEqual([]);
});
it("retains local text on external changes and detects external deletion", async () => {
  await render();
  await act(async () => current.openEdit(todo()));
  await flush();
  await act(async () =>
    current.setEditing((value) =>
      value ? { ...value, draft: { title: "local", description: "" } } : value
    )
  );
  api.rows.set("a", { ...todo(), title: "external" });
  await act(async () => current.refresh());
  await flush();
  expect(current.externalChange).toBe(true);
  expect(current.editing?.draft.title).toBe("local");
  await act(async () => current.loadLatest());
  expect(current.editing?.draft.title).toBe("external");
  api.rows.delete("a");
  await act(async () => current.refresh());
  await flush();
  expect(current.editing?.deleted).toBe(true);
  await act(async () => current.save());
  expect(api.update).not.toHaveBeenCalled();
});
it("paginates and deduplicates loaded results", async () => {
  for (let i = 0; i < 55; i++) api.rows.set(String(i), todo(String(i)));
  await render();
  expect(current.rows).toHaveLength(50);
  await act(async () => current.list.fetchNextPage());
  await flush();
  expect(current.rows).toHaveLength(56);
  expect(current.list.hasNextPage).toBe(false);
});
it("uses the generated AI operation and returns unconfigured status without retry", async () => {
  api.generate.mockResolvedValue({ generateTodos: { status: "AI_NOT_CONFIGURED", todos: [] } });
  await render();
  let result;
  await act(async () => {
    result = await current.generate("Plan release");
  });
  expect(result).toEqual({ generateTodos: { status: "AI_NOT_CONFIGURED", todos: [] } });
  expect(api.generate).toHaveBeenCalledTimes(1);
});

it("retains a confirmed completion when refreshing fails", async () => {
  await render();
  api.searches.mockImplementation(() => {
    throw new Error("list unavailable");
  });
  await act(async () => current.toggle(todo()));
  await flush();
  expect(current.rows[0]?.completed).toBe(true);
  expect(current.list.isError).toBe(true);
  expect(current.errors.a).toBeUndefined();
  expect(current.notice).toBe("todos.markedCompleted");
});
