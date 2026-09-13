import { Button, Field, FieldLabel, FieldError, Input, Textarea } from "@repo/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { NoteChecklist } from "./components/note-checklist";
import type { useNotes } from "./notes.hook";
import { canSaveNote, isNoteDirty, NEW_NOTE } from "./notes.util";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import { useTranslation } from "../../hooks/use-translation";

interface NoteEditorProps {
  selected: string;
  notes: ReturnType<typeof useNotes>;
  onChecklistPending: (pending: boolean) => void;
}

export function NoteEditor({ selected, notes, onChecklistPending }: NoteEditorProps) {
  const { t, language } = useTranslation();
  const { draft, detail } = notes;
  const form = useRef<HTMLFormElement>(null);
  const [reload, setReload] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const hasDraft = Boolean(draft);
  useEffect(() => {
    if (hasDraft) form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [selected, hasDraft]);
  useLayoutEffect(() => {
    const textarea = form.current?.querySelector("textarea");
    if (!textarea) return;
    const resize = () => {
      const scroll = textarea.closest(".ui-notes__document-scroll");
      const top = scroll?.scrollTop ?? 0;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`;
      if (scroll) scroll.scrollTop = top;
    };
    resize();
    const container = textarea.parentElement;
    let width = container?.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth !== width) {
        width = nextWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(resize);
      }
    });
    if (container) observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [draft?.body, language]);
  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        if (draft && canSaveNote(draft)) void notes.save(selected);
      }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [draft, notes, selected]);

  const back = (
    <NavLink className="ui-notes__back" to="/notes">
      {t("notes.back")}
    </NavLink>
  );
  if (!draft)
    return (
      <div className="ui-notes__document">
        {back}
        {detail.isError ? (
          <div role="alert">
            <p>{t("notes.loadFailed")}</p>
            <Button onClick={() => void detail.refetch()}>{t("common.retry")}</Button>
          </div>
        ) : selected !== NEW_NOTE && detail.isSuccess ? (
          <p>{t("notes.notFound")}</p>
        ) : (
          <LoadingRows label={t("notes.loading")} />
        )}
      </div>
    );
  const invalid = draft.title.trim().length === 0 || draft.title.trim().length > 255;
  const showTitleError = invalid && (titleTouched || draft.title.length > 0);
  const status =
    draft.status === "saving"
      ? "notes.saving"
      : isNoteDirty(draft)
        ? "notes.unsaved"
        : draft.serverId
          ? "notes.saved"
          : "notes.newDraft";
  const saved = detail.data?.note;
  const updatedLabel = `${t("notes.updated")}: `;
  const progressLabel = saved
    ? ` · ${saved.todos.filter((todo) => todo.completed).length}/${saved.todos.length} ${t("notes.completed")}`
    : "";

  return (
    <>
      <header className="ui-notes__editor-header">
        {back}
        <span role="status" className="ui-notes__meta">
          {t(status)}
        </span>
        <Button type="submit" form="note-form" disabled={!canSaveNote(draft)}>
          {t("notes.save")}
        </Button>
      </header>
      <div className="ui-notes__document-scroll">
        <div className="ui-notes__document">
          <form
            id="note-form"
            ref={form}
            onSubmit={(event) => {
              event.preventDefault();
              void notes.save(selected);
            }}
          >
            {draft.status === "error" ? (
              <div role="alert" className="ui-notes__notice">
                <FieldError>
                  {t(draft.serverId ? "notes.saveFailed" : "notes.createFailed")}
                </FieldError>
              </div>
            ) : null}
            {detail.isError ? (
              <div role="alert" className="ui-notes__notice">
                <p>{t("notes.loadFailed")}</p>
                <Button type="button" onClick={() => void detail.refetch()}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}
            {draft.deleted ? (
              <div className="ui-notes__notice" role="alert">
                <p>{t("notes.deletedExternally")}</p>
                <Button
                  type="button"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setCopyStatus("error");
                      return;
                    }
                    void navigator.clipboard.writeText(`${draft.title}\n\n${draft.body}`).then(
                      () => setCopyStatus("copied"),
                      () => setCopyStatus("error")
                    );
                  }}
                >
                  {t("notes.copyDraft")}
                </Button>
                <span role="status">
                  {copyStatus === "idle"
                    ? null
                    : t(copyStatus === "copied" ? "notes.copied" : "notes.copyFailed")}
                </span>
              </div>
            ) : notes.externalChange ? (
              <div className="ui-notes__notice" role="status">
                <p>{t("notes.updatedExternally")}</p>
                <Button type="button" appearance="subtle" onClick={() => setReload(true)}>
                  {t("notes.loadLatest")}
                </Button>
              </div>
            ) : null}
            <Field>
              <FieldLabel htmlFor="note-title">{t("notes.titleLabel")}</FieldLabel>
              <Input
                id="note-title"
                className="ui-notes__title"
                value={draft.title}
                aria-invalid={showTitleError}
                aria-describedby={showTitleError ? "note-title-error" : undefined}
                onBlur={() => setTitleTouched(true)}
                onChange={(event) => {
                  setTitleTouched(true);
                  notes.edit(selected, "title", event.target.value);
                }}
              />
              {showTitleError ? (
                <FieldError id="note-title-error">{t("notes.titleValidation")}</FieldError>
              ) : null}
            </Field>
            {saved ? (
              <p className="ui-notes__meta">
                {updatedLabel}
                <time dateTime={saved.updatedAt}>
                  {new Intl.DateTimeFormat(language, {
                    dateStyle: "medium",
                    timeStyle: "short"
                  }).format(new Date(saved.updatedAt))}
                </time>
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor="note-body">{t("notes.bodyLabel")}</FieldLabel>
              <Textarea
                id="note-body"
                value={draft.body}
                onChange={(event) => notes.edit(selected, "body", event.target.value)}
              />
            </Field>
            <p className="ui-notes__meta">{t("notes.saveHint")}</p>
          </form>
          <section className="ui-notes__checklist" aria-label={t("notes.checklist")}>
            <h2>
              {t("notes.checklist")}
              {saved ? <span className="ui-notes__meta">{progressLabel}</span> : null}
            </h2>
            <p className="ui-notes__meta">{t("notes.checklistHelp")}</p>
            {saved && !draft.deleted ? (
              <NoteChecklist
                key={saved.id}
                noteId={saved.id}
                todos={saved.todos}
                onChanged={() => void notes.refresh()}
                onPendingChange={onChecklistPending}
              />
            ) : (
              <p>{t(draft.deleted ? "notes.notFound" : "notes.saveForChecklist")}</p>
            )}
          </section>
        </div>
      </div>
      <ConfirmDialog
        isOpen={reload}
        title={t("notes.loadLatest")}
        message={t("notes.reloadWarning")}
        confirmLabel={t("notes.loadLatest")}
        cancelLabel={t("notes.keepEditing")}
        onCancel={() => setReload(false)}
        onConfirm={() => {
          notes.loadLatest();
          setReload(false);
        }}
      />
    </>
  );
}
