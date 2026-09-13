import {
  Button,
  Input,
  Field,
  FieldLabel,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Ellipsis,
  NotebookPen
} from "@repo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useBlocker, useNavigate, useParams } from "react-router-dom";

import { NoteEditor } from "./note-detail.route";
import { useNotesNavigation } from "./notes-navigation.provider";
import { useNotes } from "./notes.hook";
import { isNoteDirty } from "./notes.util";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

export function NotesRoute() {
  const { activeOrganizationId, isLoading } = useOrganization();
  return (
    <NotesWorkspace
      key={activeOrganizationId}
      organizationId={activeOrganizationId}
      enabled={Boolean(activeOrganizationId) && !isLoading}
    />
  );
}

function NotesWorkspace({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { id } = useParams();
  const selected = id ?? null;
  const notes = useNotes(organizationId, enabled, selected);
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { setProtection } = useNotesNavigation();
  const [checklistPending, setChecklistPending] = useState(0);
  const onChecklistPending = useCallback(
    (value: boolean) => setChecklistPending((count) => count + (value ? 1 : -1)),
    []
  );
  const pending = notes.pending || checklistPending > 0;
  const dirty = notes.unsaved.length > 0;
  const rail = useRef<HTMLElement>(null);
  const menuDeletion = useRef<string | null>(null);
  const previousSelection = useRef(selected);
  const createdId = selected === "new" ? notes.draft?.serverId : null;
  useEffect(() => {
    if (createdId) {
      notes.promoteNew();
      void navigate(`/notes/${createdId}`, { replace: true });
    }
  }, [createdId, navigate, notes]);
  const blocker = useBlocker(
    ({ nextLocation }) =>
      (dirty || pending) && !/^\/notes(?:\/[^/]+)?\/?$/.test(nextLocation.pathname)
  );
  useEffect(() => {
    setProtection({ dirty, pending });
    return () => setProtection({ dirty: false, pending: false });
  }, [dirty, pending, setProtection]);
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty && !pending) blocker.proceed();
  }, [blocker, dirty, pending]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  useEffect(() => {
    if (!selected && previousSelection.current) {
      const link = rail.current?.querySelector<HTMLAnchorElement>(
        `a[data-note-key="${CSS.escape(previousSelection.current)}"]`
      );
      (link ?? rail.current?.querySelector<HTMLInputElement>("input"))?.focus();
    }
    previousSelection.current = selected;
  }, [selected]);

  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium" });
  const draftKeys = new Set(notes.unsaved.map(([key]) => key));
  function keyFor(id: string) {
    return Object.entries(notes.drafts).find(([, draft]) => draft.serverId === id)?.[0] ?? id;
  }
  function newNote() {
    notes.startNew();
    void navigate("/notes/new");
    requestAnimationFrame(() => document.getElementById("note-title")?.focus());
  }
  function row(key: string, title: string, body: string, updatedAt?: string, serverId?: string) {
    const draft = notes.drafts[key];
    return (
      <li key={key} className="ui-notes__row" data-active={selected === key}>
        <NavLink to={`/notes/${key}`} data-note-key={key} className="ui-notes__select">
          <strong>{title || t("notes.untitled")}</strong>
          {body ? <span className="ui-notes__preview">{body}</span> : null}
          <span className="ui-notes__meta">
            {draft?.status === "saving" ? (
              t("notes.saving")
            ) : draft && isNoteDirty(draft) ? (
              t("notes.unsaved")
            ) : updatedAt ? (
              <time dateTime={updatedAt}>{date.format(new Date(updatedAt))}</time>
            ) : (
              t("notes.newDraft")
            )}
          </span>
        </NavLink>
        {serverId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                appearance="subtle"
                data-note-menu={serverId}
                aria-label={`${t("notes.menu")}: ${title}`}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (menuDeletion.current === serverId) {
                  event.preventDefault();
                  menuDeletion.current = null;
                  rail.current
                    ?.querySelector<HTMLButtonElement>(
                      `button[data-note-menu="${CSS.escape(serverId)}"]`
                    )
                    ?.focus();
                  notes.setDeleting(serverId);
                }
              }}
            >
              <DropdownMenuItem
                destructive
                disabled={pending}
                onSelect={() => {
                  menuDeletion.current = serverId;
                }}
              >
                {t("notes.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </li>
    );
  }

  return (
    <section className="ui-notes" data-detail={Boolean(selected)}>
      <header className="ui-page-header">
        <div>
          <h1>{t("notes.title")}</h1>
          <p className="ui-notes__meta">{t("notes.description")}</p>
        </div>
        <Button onClick={newNote} disabled={!enabled}>
          {t("notes.create")}
        </Button>
      </header>
      <div className="ui-notes__workspace">
        <aside ref={rail} className="ui-notes__rail" aria-label={t("notes.library")}>
          <div className="ui-notes__rail-header">
            <h2>{t("notes.library")}</h2>
            <Field>
              <FieldLabel htmlFor="notes-search">{t("notes.search")}</FieldLabel>
              <Input
                id="notes-search"
                type="search"
                value={notes.search}
                onChange={(event) => notes.setSearch(event.target.value)}
              />
            </Field>
          </div>
          <div className="ui-notes__list-scroll">
            {notes.unsaved.length ? (
              <section aria-label={t("notes.drafts")}>
                <h3>{t("notes.drafts")}</h3>
                <ul className="ui-notes__rows">
                  {notes.unsaved.map(([key, draft]) =>
                    row(key, draft.title, draft.body, undefined, draft.serverId ?? undefined)
                  )}
                </ul>
              </section>
            ) : null}
            <p className="ui-notes__meta">
              {t(notes.phrase ? "notes.searchResults" : "notes.newestFirst")}
            </p>
            {notes.list.isPending ? <LoadingRows label={t("notes.loading")} /> : null}
            {notes.list.isError ? (
              <div role="alert">
                <p>{t("notes.loadFailed")}</p>
                <Button
                  appearance="subtle"
                  onClick={() =>
                    void (notes.list.isFetchNextPageError
                      ? notes.list.fetchNextPage()
                      : notes.list.refetch())
                  }
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}
            {!notes.list.isPending && !notes.list.isError && notes.rows.length === 0 ? (
              <p>{t(notes.phrase ? "notes.noResults" : "notes.empty")}</p>
            ) : null}
            <ul className="ui-notes__rows">
              {notes.rows
                .filter((note) => !draftKeys.has(keyFor(note.id)))
                .map((note) =>
                  row(keyFor(note.id), note.title, note.body ?? "", note.updatedAt, note.id)
                )}
            </ul>
            {notes.list.hasNextPage ? (
              <Button
                appearance="subtle"
                disabled={notes.list.isFetching}
                onClick={() => void notes.list.fetchNextPage()}
              >
                {t(notes.list.isFetchingNextPage ? "notes.loading" : "notes.loadMore")}
              </Button>
            ) : null}
          </div>
        </aside>
        <section className="ui-notes__detail" aria-label={t("notes.editor")}>
          {selected ? (
            <NoteEditor
              key={selected}
              selected={selected}
              notes={notes}
              onChecklistPending={onChecklistPending}
            />
          ) : (
            <div className="ui-notes__welcome">
              <NotebookPen aria-hidden="true" />
              <h2>{t("notes.welcome")}</h2>
              <p>{t("notes.welcomeDescription")}</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog
        isOpen={Boolean(notes.deleting)}
        title={t("notes.deleteConfirmTitle")}
        message={
          notes.deleteError
            ? t("notes.deleteFailed")
            : `${t("notes.deleteConfirmMessage")} ${t("notes.deleteDraftWarning")}`
        }
        confirmLabel={t("notes.delete")}
        cancelLabel={t("button.cancel")}
        isConfirming={notes.deletePending}
        onCancel={() => notes.setDeleting(null)}
        onConfirm={() => {
          const deleting = notes.deleting;
          if (deleting)
            void notes.deleteNote(deleting).then((deleted) => {
              if (deleted) void navigate("/notes");
            });
        }}
      />
      <ConfirmDialog
        isOpen={blocker.state === "blocked"}
        title={t("notes.leaveTitle")}
        message={t(pending ? "notes.waitForSave" : "notes.leaveMessage")}
        confirmLabel={t("notes.discardLeave")}
        cancelLabel={t("notes.keepEditing")}
        isConfirming={pending}
        onCancel={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
        onConfirm={() => {
          if (!pending && blocker.state === "blocked") blocker.proceed();
        }}
      />
    </section>
  );
}
