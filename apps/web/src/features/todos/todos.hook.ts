import { createActiveOrganizationQueryKey } from "@repo/query";
import { toTodoCreatePayload, toTodoUpdatePayload } from "@repo/todos";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { sameTodoText, validTodo } from "./todos.util";
import {
  useGetTodosQuery,
  useGetTodoQuery,
  useGenerateTodosMutation,
  useDeleteFileMutation,
  useTodoCountsQuery
} from "../../graphql/generated/react-query";
import { useLiveTodos } from "../../hooks/use-live-list";
import { useSyncEngine, useSyncStatus } from "../../hooks/use-sync";
import { queryRuntime } from "../../lib/query-runtime";
import { planErrorOf } from "../billing/billing.hook";

/** The error key of a Todo create refused by the Plan's todo limit. */
export const PLAN_LIMIT_ERROR_KEY = "billing.limitReached.todos";

queryRuntime.registerOrgScopedOperation("todos.web.list", useGetTodosQuery.getKey());
const detailPrefix = useGetTodoQuery.getKey({ id: "" }).slice(0, 1);
queryRuntime.registerOrgScopedOperation("todos.web.detail", detailPrefix);
queryRuntime.registerOrgScopedOperation("todos.web.counts", useTodoCountsQuery.getKey());

/** The Active Organization's open and completed Todo totals. */
export function useTodoCounts(organizationId: string | null, enabled: boolean) {
  return useTodoCountsQuery(undefined, {
    enabled,
    queryKey: createActiveOrganizationQueryKey(useTodoCountsQuery.getKey(), organizationId)
  });
}
const EMPTY_DRAFT: TodoDraft = { title: "", description: "" };

/**
 * The Active Organization's Todos from the local sync collection. Reads and
 * writes work offline: a write shows at once and syncs when the network
 * allows; a write the server refuses rolls back with a toast (sync.provider).
 * Generating Todos and Attachments still need the network.
 */
export function useTodos(
  organizationId: string | null,
  enabled: boolean,
  search: string,
  status: string
) {
  const client = useQueryClient();
  const engine = useSyncEngine();
  const syncStatus = useSyncStatus();
  const [draft, setDraft] = useState<TodoDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{
    base: TodoItem;
    draft: TodoDraft;
    deleted: boolean;
  } | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState<number>(TODOS_CONFIG.pageSize);
  const locks = useRef(new Set<string>());
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const completed = status === "all" ? null : status === "completed";
  const live = useLiveQuery(() => (enabled ? engine?.todos : null), [engine, enabled]);
  const all = [...(live.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const matching = all.filter(
    (item) =>
      (completed === null || item.completed === completed) &&
      (item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.description ?? "").toLowerCase().includes(search.toLowerCase()))
  );
  useEffect(() => {
    setVisible(TODOS_CONFIG.pageSize);
  }, [search, status]);
  // The list's loading and paging state, in the shape the route reads. With
  // no rows to show, a failed pull is a load error the user can retry.
  const list = {
    isPending: !live.isReady,
    isError: live.isReady && all.length === 0 && syncStatus?.state === "error",
    isFetchNextPageError: false,
    hasNextPage: matching.length > visible,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {
      setVisible((count) => count + TODOS_CONFIG.pageSize);
    },
    refetch: () => engine?.pull().catch(() => undefined)
  };
  const generate = useGenerateTodosMutation({ retry: false });
  const removeFile = useDeleteFileMutation({ retry: false });
  const countsKey = useTodoCountsQuery.getKey();
  useLiveTodos({
    enabled,
    invalidateKeys: [countsKey],
    onDeleted: (id) =>
      setEditing((current) => (current?.base.id === id ? { ...current, deleted: true } : current)),
    onEvent: () => void engine?.pull().catch(() => undefined)
  });
  const latest = editing ? all.find((item) => item.id === editing.base.id) : undefined;
  useEffect(() => {
    if (editing && !editing.deleted && live.isReady && !latest)
      setEditing((current) => (current ? { ...current, deleted: true } : current));
  }, [editing, latest, live.isReady]);
  const externalChange = Boolean(
    editing &&
    latest &&
    !sameTodoText(
      { title: latest.title, description: latest.description ?? "" },
      { title: editing.base.title, description: editing.base.description ?? "" }
    )
  );

  async function refresh() {
    await Promise.all([engine?.pull(), client.invalidateQueries({ queryKey: countsKey })]);
  }
  function clearError(key: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
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
    } catch (error) {
      // A refusal by the Plan is certain and names its fix; other failures may have written.
      const shown = planErrorOf(error) === "PLAN_LIMIT_REACHED" ? PLAN_LIMIT_ERROR_KEY : errorKey;
      if (alive.current) setErrors((current) => ({ ...current, [key]: shown }));
      return undefined;
    } finally {
      locks.current.delete(key);
      if (alive.current) setPending([...locks.current]);
    }
  }
  /** Runs a local write; one that cannot start (the Outbox failed to load) shows an error. */
  async function write(key: string, action: () => Promise<unknown>): Promise<boolean> {
    clearError(key);
    try {
      await action();
      return true;
    } catch {
      if (alive.current) setErrors((current) => ({ ...current, [key]: "todos.actionFailed" }));
      return false;
    }
  }
  async function add(input = draft) {
    if (!validTodo(input) || !engine || locks.current.has("create")) return false;
    // A double submit creates one Todo.
    locks.current.add("create");
    let written = false;
    try {
      written = await write("create", () => engine.createTodo(toTodoCreatePayload(input)));
    } finally {
      locks.current.delete("create");
    }
    if (!written) return false;
    setDraft(EMPTY_DRAFT);
    setNotice("todos.created");
    return true;
  }
  async function save() {
    if (!engine || !editing || editing.deleted || !validTodo(editing.draft)) return false;
    const { id } = editing.base;
    if (!(await write(id, () => engine.updateTodo(id, toTodoUpdatePayload(editing.draft)))))
      return false;
    setEditing(null);
    setNotice("todos.saved");
    return true;
  }
  async function toggle(item: TodoItem) {
    if (!engine) return;
    // Sets the state the user sees, never flips it: a replayed change stays correct.
    if (await write(item.id, () => engine.updateTodo(item.id, { completed: !item.completed })))
      setNotice(item.completed ? "todos.markedOpen" : "todos.markedCompleted");
  }
  async function deleteTodo(id: string) {
    if (!engine || !(await write(id, () => engine.deleteTodo(id)))) return false;
    setNotice("todos.deleted");
    return true;
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
    rows: matching.slice(0, visible),
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
