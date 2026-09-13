import { createActiveOrganizationQueryKey } from "@repo/query";
import { toTodoCreatePayload, toTodoUpdatePayload } from "@repo/todos";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { sameTodoText, validTodo } from "./todos.util";
import {
  GetTodosDocument,
  useGetTodosQuery,
  useGetTodoQuery,
  useCreateTodoMutation,
  useUpdateTodoMutation,
  useDeleteTodoMutation,
  useGenerateTodosMutation,
  useDeleteFileMutation,
  type GetTodosQuery,
  type GetTodosQueryVariables
} from "../../graphql/generated/react-query";
import { useSubscription } from "../../hooks/use-subscription";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("todos.web.list", useGetTodosQuery.getKey());
const detailPrefix = useGetTodoQuery.getKey({ id: "" }).slice(0, 1);
queryRuntime.registerOrgScopedOperation("todos.web.detail", detailPrefix);
const EMPTY_DRAFT: TodoDraft = { title: "", description: "" };
type TodoPage = GetTodosQuery & { nextOffset: number | undefined };

export function useTodos(
  organizationId: string | null,
  enabled: boolean,
  search: string,
  status: string
) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{
    base: TodoItem;
    draft: TodoDraft;
    deleted: boolean;
  } | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const locks = useRef(new Set<string>());
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const completed = status === "all" ? null : status === "completed";
  const fetchTodos = useGraphqlFetcher<GetTodosQuery, GetTodosQueryVariables>(GetTodosDocument);
  const listKey = createActiveOrganizationQueryKey(
    [...useGetTodosQuery.getKey({ search, completed, limit: TODOS_CONFIG.pageSize }), "pages"],
    organizationId
  );
  const list = useInfiniteQuery({
    queryKey: listKey,
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<TodoPage> => {
      const result = await fetchTodos({
        search,
        completed,
        limit: TODOS_CONFIG.pageSize,
        offset: pageParam
      });
      return {
        ...result,
        nextOffset:
          result.todos.length === TODOS_CONFIG.pageSize
            ? pageParam + TODOS_CONFIG.pageSize
            : undefined
      };
    },
    getNextPageParam: (last) => last.nextOffset
  });
  const detailKey = createActiveOrganizationQueryKey(
    useGetTodoQuery.getKey({ id: editing?.base.id ?? "" }),
    organizationId
  );
  const detail = useGetTodoQuery(
    { id: editing?.base.id ?? "" },
    { enabled: enabled && Boolean(editing), queryKey: detailKey }
  );
  const create = useCreateTodoMutation({ retry: false });
  const update = useUpdateTodoMutation({ retry: false });
  const remove = useDeleteTodoMutation({ retry: false });
  const generate = useGenerateTodosMutation({ retry: false });
  const removeFile = useDeleteFileMutation({ retry: false });
  const invalidationKeys = [listKey, detailKey];
  useSubscription({
    query: "subscription { todoCreated { id } }",
    enabled,
    invalidateKeys: invalidationKeys
  });
  useSubscription({
    query: "subscription { todoUpdated { id } }",
    enabled,
    invalidateKeys: invalidationKeys
  });
  useSubscription({
    query: "subscription { todoToggled { id } }",
    enabled,
    invalidateKeys: invalidationKeys
  });
  useSubscription<{ todoDeleted: { id: string } }>({
    query: "subscription { todoDeleted { id } }",
    enabled,
    invalidateKeys: invalidationKeys,
    onData: ({ todoDeleted }) =>
      setEditing((current) =>
        current?.base.id === todoDeleted.id ? { ...current, deleted: true } : current
      )
  });
  useEffect(() => {
    if (detail.isSuccess && detail.data.todo === null)
      setEditing((current) => (current ? { ...current, deleted: true } : current));
  }, [detail.data, detail.isSuccess]);
  const latest = detail.data?.todo;
  const externalChange = Boolean(
    editing &&
    latest &&
    latest.id === editing.base.id &&
    !sameTodoText(
      { title: latest.title, description: latest.description ?? "" },
      { title: editing.base.title, description: editing.base.description ?? "" }
    )
  );

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: useGetTodosQuery.getKey() }),
      client.invalidateQueries({ queryKey: detailPrefix })
    ]);
  }
  function clearError(key: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  function confirmRow(id: string, patch: Partial<TodoItem> | null) {
    client.setQueriesData<InfiniteData<TodoPage>>(
      {
        queryKey: useGetTodosQuery.getKey(),
        predicate: (query) =>
          query.queryKey.includes("pages") && query.queryKey.includes(organizationId)
      },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                todos:
                  patch === null
                    ? page.todos.filter((item) => item.id !== id)
                    : page.todos.map((item) => (item.id === id ? { ...item, ...patch } : item))
              }))
            }
          : data
    );
  }
  async function run<T>(key: string, action: () => Promise<T>, errorKey = "todos.actionFailed") {
    if (!enabled || !alive.current || locks.current.has(key)) return;
    locks.current.add(key);
    setPending([...locks.current]);
    clearError(key);
    try {
      const result = await action();
      if (!alive.current) return;
      // A successful write stays successful if refreshing the list fails.
      void refresh().catch(() => undefined);
      return result;
    } catch {
      if (alive.current) setErrors((current) => ({ ...current, [key]: errorKey }));
      return undefined;
    } finally {
      locks.current.delete(key);
      if (alive.current) setPending([...locks.current]);
    }
  }
  async function add(input = draft) {
    if (!validTodo(input)) return false;
    const result = await run(
      "create",
      () => create.mutateAsync({ input: toTodoCreatePayload(input) }),
      "todos.createUncertain"
    );
    if (!result) return false;
    setDraft(EMPTY_DRAFT);
    setNotice("todos.created");
    return true;
  }
  async function save() {
    if (!editing || editing.deleted || !validTodo(editing.draft)) return false;
    const result = await run(editing.base.id, () =>
      update.mutateAsync({ id: editing.base.id, input: toTodoUpdatePayload(editing.draft) })
    );
    if (!result) return false;
    confirmRow(editing.base.id, result.updateTodo);
    setEditing(null);
    setNotice("todos.saved");
    return true;
  }
  async function toggle(item: TodoItem) {
    const result = await run(item.id, () =>
      update.mutateAsync({ id: item.id, input: { completed: !item.completed } })
    );
    if (result) {
      confirmRow(item.id, result.updateTodo);
      setNotice(result.updateTodo.completed ? "todos.markedCompleted" : "todos.markedOpen");
    }
  }
  async function deleteTodo(id: string) {
    const result = await run(id, () => remove.mutateAsync({ id }));
    if (result) {
      confirmRow(id, null);
      setNotice("todos.deleted");
    }
    return Boolean(result);
  }
  function openEdit(item: TodoItem) {
    clearError(item.id);
    setEditing({
      base: item,
      draft: { title: item.title, description: item.description ?? "" },
      deleted: false
    });
  }
  return {
    list,
    rows: [
      ...new Map(
        (list.data?.pages.flatMap((page) => page.todos) ?? []).map((item) => [item.id, item])
      ).values()
    ].filter(
      (item) =>
        (completed === null || item.completed === completed) &&
        (item.title.toLowerCase().includes(search.toLowerCase()) ||
          (item.description ?? "").toLowerCase().includes(search.toLowerCase()))
    ),
    draft,
    setDraft,
    editing,
    setEditing,
    pending,
    errors,
    notice,
    setNotice,
    clearError,
    run,
    refresh,
    add,
    save,
    toggle,
    deleteTodo,
    openEdit,
    externalChange,
    detail,
    editDirty: Boolean(
      editing &&
      !sameTodoText(editing.draft, {
        title: editing.base.title,
        description: editing.base.description ?? ""
      })
    ),
    loadLatest: () => {
      if (latest) openEdit(latest);
    },
    generate: (prompt: string) =>
      run("generate", () => generate.mutateAsync({ input: { prompt } }), "todos.ai.failed"),
    deleteAttachment: (todoId: string, fileId: string) =>
      run(todoId, () => removeFile.mutateAsync({ fileId }), "todos.attachments.error.deleteFailed")
  };
}
