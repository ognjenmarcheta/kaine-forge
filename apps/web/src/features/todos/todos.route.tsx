import { toTodoCreatePayload } from "@repo/todos";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Field,
  FieldLabel,
  Input,
  FormModal,
  Textarea
} from "@repo/ui";
import { useEffect, useRef, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";

import { TodoFormDialog } from "./components/todo-edit-dialog";
import { TodoExamples } from "./components/todo-examples";
import { TodoList } from "./components/todo-list";
import { useTodoUpload } from "./todos-upload.hook";
import { useTodos } from "./todos.hook";
import type { TodoDraft } from "./todos.type";
import { todoStatus, validTodo } from "./todos.util";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import { useWorkspaceNavigation } from "../../components/workspace-navigation.provider";
import { useCreateTodoMutation, useUpdateTodoMutation } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

export function TodosRoute() {
  const { activeOrganizationId, isLoading } = useOrganization();
  return (
    <TodosWorkspace
      key={activeOrganizationId}
      organizationId={activeOrganizationId}
      enabled={Boolean(activeOrganizationId) && !isLoading}
    />
  );
}
function TodosWorkspace({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get("search") ?? "";
  const status = todoStatus(params.get("status"));
  const [search, setSearch] = useState(urlSearch);
  const lastUrl = useRef(urlSearch);
  useEffect(() => {
    if (lastUrl.current !== urlSearch) {
      lastUrl.current = urlSearch;
      setSearch(urlSearch);
    }
  }, [urlSearch]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== urlSearch) {
        setParams(
          (current) => {
            const next = new URLSearchParams(current);
            if (search.trim()) next.set("search", search.trim());
            else next.delete("search");
            return next;
          },
          { replace: true }
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, urlSearch, setParams]);
  const todos = useTodos(organizationId, enabled, urlSearch.trim(), status);
  const uploader = useTodoUpload(todos.refresh);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [attachmentDelete, setAttachmentDelete] = useState<{
    todoId: string;
    fileId: string;
  } | null>(null);
  const [discard, setDiscard] = useState<"edit" | "example" | "reload" | null>(null);
  const [example, setExample] = useState<"simple" | "advanced" | null>(null);
  const [exampleDirty, setExampleDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiCount, setAiCount] = useState<number | null>(null);
  const [copyError, setCopyError] = useState(false);
  const quickInput = useRef<HTMLInputElement>(null);
  const focusQuickAddOnClose = useRef(false);
  const listRegion = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const menuAction = useRef<"ai" | "simple" | "advanced" | null>(null);
  const previousIds = useRef<string[]>([]);
  const focusedId = useRef<string | null>(null);
  const ids = todos.rows.map((item) => item.id);
  useEffect(() => {
    const old = previousIds.current;
    const id = focusedId.current;
    if (id && !ids.includes(id)) {
      const index = old.indexOf(id);
      const candidate =
        old.slice(index + 1).find((value) => ids.includes(value)) ??
        old
          .slice(0, index)
          .reverse()
          .find((value) => ids.includes(value));
      const target = candidate
        ? listRegion.current?.querySelector<HTMLElement>(
            '[data-todo-id="' + CSS.escape(candidate) + '"] button'
          )
        : null;
      (target ?? heading.current)?.focus();
      focusedId.current = null;
    }
    previousIds.current = ids;
  }, [ids]);
  const pending = todos.pending.length > 0 || Boolean(uploader.upload?.pending);
  const dirty = Boolean(
    todos.draft.title || todos.draft.description || todos.editDirty || aiPrompt || exampleDirty
  );
  const { setProtection } = useWorkspaceNavigation();
  useEffect(() => {
    setProtection({ dirty, pending, feature: "todos" });
    return () => setProtection({ dirty: false, pending: false });
  }, [dirty, pending, setProtection]);
  const blocker = useBlocker(
    ({ nextLocation }) => (dirty || pending) && nextLocation.pathname !== "/todos"
  );
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty && !pending) blocker.proceed();
  }, [blocker, dirty, pending]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  const createMutation = useCreateTodoMutation({ retry: false });
  const updateMutation = useUpdateTodoMutation({ retry: false });
  function clearFilters() {
    setSearch("");
    setParams({});
  }
  function closeEdit() {
    if (todos.editing && todos.pending.includes(todos.editing.base.id)) return;
    if (todos.editDirty) setDiscard("edit");
    else todos.setEditing(null);
  }
  function closeExample() {
    if (todos.pending.includes("example")) return;
    if (exampleDirty) setDiscard("example");
    else setExample(null);
  }
  async function add() {
    if (await todos.add()) {
      focusQuickAddOnClose.current = true;
      setCreateOpen(false);
      if (!createOpen) requestAnimationFrame(() => quickInput.current?.focus());
    }
  }
  async function createExample(draft: TodoDraft, completed: boolean) {
    if (!validTodo(draft)) throw new Error("invalid Todo");
    const result = await todos.run(
      "example",
      async () => {
        const created = await createMutation.mutateAsync({ input: toTodoCreatePayload(draft) });
        const confirmed =
          !completed ||
          Boolean(
            await todos.run(created.createTodo.id, () =>
              updateMutation.mutateAsync({ id: created.createTodo.id, input: { completed: true } })
            )
          );
        return { created, confirmed };
      },
      "todos.createUncertain"
    );
    if (!result) throw new Error("create failed");
    setExampleDirty(false);
    setExample(null);
    todos.setNotice(result.confirmed ? "todos.created" : "todos.createdCompletionFailed");
  }
  async function generate() {
    if (!aiPrompt.trim() || todos.pending.includes("generate")) return;
    setAiError("");
    const result = await todos.generate(aiPrompt.trim());
    if (!result) {
      setAiError("todos.ai.failed");
      return;
    }
    if (result.generateTodos.status === "CREATED") {
      setAiCount(result.generateTodos.todos.length);
      setAiPrompt("");
      setAiOpen(false);
    } else
      setAiError(
        result.generateTodos.status === "AI_NOT_CONFIGURED"
          ? "todos.ai.notConfigured"
          : "todos.ai.failed"
      );
  }
  const busyIds = [...todos.pending, ...(uploader.upload?.pending ? [uploader.upload.todoId] : [])];
  const editPending = Boolean(todos.editing && busyIds.includes(todos.editing.base.id));
  const emptyKey = urlSearch.trim()
    ? "todos.noResults"
    : status !== "all"
      ? "todos.emptyStatus"
      : "todos.empty";
  return (
    <section className="ui-todos">
      <header className="ui-page-header">
        <h1>{t("todos.title")}</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button appearance="subtle">{t("todos.moreActions")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={() => {
              const action = menuAction.current;
              menuAction.current = null;
              if (action)
                requestAnimationFrame(() => {
                  if (action === "ai") setAiOpen(true);
                  else setExample(action);
                });
            }}
          >
            <DropdownMenuItem
              onSelect={() => {
                menuAction.current = "ai";
              }}
            >
              {t("todos.ai.title")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                menuAction.current = "simple";
              }}
            >
              {t("todos.examples.simple.open")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                menuAction.current = "advanced";
              }}
            >
              {t("todos.examples.advanced.open")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="ui-todos__toolbar">
        <form
          className="ui-todos__quick"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        >
          <Field>
            <FieldLabel htmlFor="todo-quick-title">{t("todos.quickTitle")}</FieldLabel>
            <Input
              ref={quickInput}
              id="todo-quick-title"
              value={todos.draft.title}
              disabled={!enabled || todos.pending.includes("create")}
              onChange={(event) => todos.setDraft({ ...todos.draft, title: event.target.value })}
              aria-describedby="todo-quick-help"
            />
          </Field>
          <Button
            type="submit"
            disabled={!enabled || !validTodo(todos.draft) || todos.pending.includes("create")}
          >
            {t(todos.pending.includes("create") ? "todos.saving" : "todos.add")}
          </Button>
          <Button
            type="button"
            appearance="subtle"
            disabled={todos.pending.includes("create")}
            onClick={() => {
              focusQuickAddOnClose.current = false;
              setCreateOpen(true);
            }}
          >
            {t("todos.addDetails")}
          </Button>
        </form>
        <small id="todo-quick-help">
          {t(
            todos.draft.title.trim().length > 255
              ? "todos.titleValidation"
              : todos.draft.description
                ? "todos.detailsAdded"
                : "todos.quickHint"
          )}
        </small>
        {todos.errors.create ? (
          <div role="alert">
            <p>{t(todos.errors.create)}</p>
            <Button appearance="subtle" onClick={() => void todos.refresh()}>
              {t("todos.refresh")}
            </Button>
          </div>
        ) : null}
        <div className="ui-todos__filters">
          <Field>
            <FieldLabel htmlFor="todo-search">{t("todos.search")}</FieldLabel>
            <Input
              id="todo-search"
              type="search"
              value={search}
              onFocus={() => {
                focusedId.current = null;
              }}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <div className="ui-toolbar" role="group" aria-label={t("todos.statusFilter")}>
            {["all", "open", "completed"].map((value) => (
              <Button
                key={value}
                appearance={status === value ? "default" : "subtle"}
                aria-pressed={status === value}
                onClick={() =>
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    focusedId.current = null;
                    next.set("status", value);
                    return next;
                  })
                }
              >
                {t("todos.filter." + value)}
              </Button>
            ))}
          </div>
        </div>
        <div role="status">
          {todos.notice ? t(todos.notice) : null}
          {aiCount !== null ? (
            <p>{t("todos.ai.createdCount").replace("{count}", String(aiCount))}</p>
          ) : null}
          {(todos.notice === "todos.created" || aiCount !== null) &&
          (status !== "all" || urlSearch) ? (
            <Button appearance="link" onClick={clearFilters}>
              {t("todos.showAll")}
            </Button>
          ) : null}
        </div>
        {uploader.upload ? (
          <div role={uploader.upload.failed ? "alert" : "status"}>
            {t(
              uploader.upload.failed
                ? "todos.uploadFailed"
                : uploader.upload.pending
                  ? "todos.uploadProgress"
                  : "todos.uploaded"
            )
              .replace("{title}", uploader.upload.title)
              .replace("{filename}", uploader.upload.filename)
              .replace("{progress}", String(uploader.upload.progress))}
          </div>
        ) : null}
      </div>
      <div
        className="ui-todos__list-scroll"
        ref={listRegion}
        onFocusCapture={(event) => {
          focusedId.current =
            event.target.closest<HTMLElement>("[data-todo-id]")?.dataset.todoId ?? null;
        }}
      >
        <h2 ref={heading} tabIndex={-1} className="ui-todos__list-heading">
          {t("todos.loaded").replace("{count}", String(todos.rows.length))}
        </h2>
        {todos.list.isPending ? <LoadingRows label={t("todos.loading")} /> : null}
        {todos.list.isError ? (
          <div role="alert">
            <p>
              {t(todos.list.isFetchNextPageError ? "todos.loadMoreFailed" : "todos.loadFailed")}
            </p>
            <Button
              appearance="subtle"
              onClick={() => {
                if (todos.list.isFetchNextPageError) void todos.list.fetchNextPage();
                else void todos.list.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {!todos.list.isPending && !todos.list.isError && todos.rows.length === 0 ? (
          <div className="ui-empty-state">
            <p>{t(emptyKey)}</p>
            {status !== "all" || urlSearch ? (
              <Button appearance="subtle" onClick={clearFilters}>
                {t("todos.showAll")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <TodoList
          items={todos.rows}
          pending={busyIds}
          errors={todos.errors}
          uploadBusy={Boolean(uploader.upload?.pending)}
          onEdit={(item) => {
            setCopyError(false);
            todos.openEdit(item);
          }}
          onDelete={setDeleting}
          onToggle={(item) => void todos.toggle(item)}
          onUpload={(file, item) => {
            if (!busyIds.includes(item.id)) void uploader.start(file, item.id, item.title);
          }}
          onDeleteAttachment={(todoId, fileId) => setAttachmentDelete({ todoId, fileId })}
          onRefresh={() => void todos.refresh()}
        />
        {todos.list.hasNextPage ? (
          <Button
            appearance="subtle"
            disabled={todos.list.isFetching}
            onClick={() => void todos.list.fetchNextPage()}
          >
            {t(todos.list.isFetchingNextPage ? "todos.loading" : "todos.loadMore")}
          </Button>
        ) : null}
      </div>
      <TodoFormDialog
        open={createOpen}
        draft={todos.draft}
        onChange={todos.setDraft}
        onClose={() => setCreateOpen(false)}
        onCloseAutoFocus={(event) => {
          if (!focusQuickAddOnClose.current) return;
          event.preventDefault();
          focusQuickAddOnClose.current = false;
          quickInput.current?.focus();
        }}
        onSave={() => void add()}
        pending={todos.pending.includes("create")}
        error={todos.errors.create}
        onRefresh={() => void todos.refresh()}
      />
      {todos.editing ? (
        <TodoFormDialog
          open
          editing
          draft={todos.editing.draft}
          onChange={(draft) =>
            todos.setEditing((current) => (current ? { ...current, draft } : current))
          }
          onClose={closeEdit}
          onSave={() => void todos.save()}
          pending={editPending}
          error={copyError ? "todos.copyFailed" : todos.errors[todos.editing.base.id]}
          unchanged={!todos.editDirty}
          deleted={todos.editing.deleted}
          externalChange={todos.externalChange}
          onReload={() => setDiscard("reload")}
          onRefresh={() => void todos.refresh()}
          onCopy={() => {
            const draft = todos.editing?.draft;
            if (draft)
              void (async () => {
                try {
                  await navigator.clipboard.writeText(draft.title + "\n\n" + draft.description);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              })();
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        isConfirming={Boolean(deleting && busyIds.includes(deleting))}
        title={t("todos.deleteConfirmTitle")}
        message={t(
          todos.errors[deleting ?? ""] ? "todos.deleteFailed" : "todos.deleteConfirmMessage"
        )}
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting)
            void todos.deleteTodo(deleting).then((success) => {
              if (success) setDeleting(null);
            });
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(attachmentDelete)}
        isConfirming={Boolean(attachmentDelete && busyIds.includes(attachmentDelete.todoId))}
        title={t("todos.attachments.deleteConfirmTitle")}
        message={t(
          attachmentDelete && todos.errors[attachmentDelete.todoId]
            ? "todos.attachments.error.deleteFailed"
            : "todos.attachments.deleteConfirmMessage"
        )}
        cancelLabel={t("button.cancel")}
        confirmLabel={t("todos.attachments.delete")}
        onCancel={() => setAttachmentDelete(null)}
        onConfirm={() => {
          if (attachmentDelete)
            void todos
              .deleteAttachment(attachmentDelete.todoId, attachmentDelete.fileId)
              .then((result) => {
                if (result) setAttachmentDelete(null);
              });
        }}
      />
      <ConfirmDialog
        isOpen={discard !== null}
        title={t("todos.discardTitle")}
        message={t(discard === "reload" ? "todos.reloadConfirm" : "todos.discardMessage")}
        cancelLabel={t("todos.keepEditing")}
        confirmLabel={t("todos.discard")}
        onCancel={() => setDiscard(null)}
        onConfirm={() => {
          if (discard === "edit") todos.setEditing(null);
          else if (discard === "reload") todos.loadLatest();
          else {
            setExample(null);
            setExampleDirty(false);
          }
          setDiscard(null);
        }}
      />
      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        isConfirming={pending}
        title={t("todos.leaveTitle")}
        message={t(pending ? "todos.waitForSave" : "todos.leaveMessage")}
        cancelLabel={t("todos.keepEditing")}
        confirmLabel={t("todos.discardLeave")}
        onCancel={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        onConfirm={() => {
          if (!pending && blocker.state === "blocked") blocker.proceed();
        }}
      />
      <TodoExamples
        mode={example}
        onClose={closeExample}
        onCreate={createExample}
        pending={todos.pending.includes("example")}
        onDirty={() => setExampleDirty(true)}
      />
      <FormModal
        open={aiOpen}
        onOpenChange={setAiOpen}
        title={t("todos.ai.title")}
        description={t("todos.ai.description")}
        closeButtonLabel={t("common.close")}
        cancelLabel={t("common.close")}
        isSubmitting={todos.pending.includes("generate")}
        submitLabel={t("todos.ai.submit")}
        submitDisabled={!aiPrompt.trim()}
        submittingLabel={t("todos.ai.generating")}
        onSubmit={() => generate()}
      >
        <Field>
          <FieldLabel htmlFor="todos-ai-prompt">{t("todos.ai.promptLabel")}</FieldLabel>
          <Textarea
            id="todos-ai-prompt"
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
          />
        </Field>
        {aiError ? (
          <div role="alert">
            <p>{t(aiError)}</p>
            <Button type="button" appearance="subtle" onClick={() => void todos.refresh()}>
              {t("todos.refresh")}
            </Button>
          </div>
        ) : null}
      </FormModal>
    </section>
  );
}
