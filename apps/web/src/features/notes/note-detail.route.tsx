import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, Field, FieldError, FieldLabel, Input, Textarea } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";

import { NoteChecklist } from "./components/note-checklist";
import { LoadingRows } from "../../components/loading-rows";
import { useGetNoteQuery, useUpdateNoteMutation } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";

export function NoteDetailRoute() {
  const { id } = useParams();
  const { activeOrganizationId } = useOrganization();
  return <NoteEditor key={activeOrganizationId + ":" + id} />;
}

function NoteEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const dirty = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const noteQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGetNoteQuery.getKey({ id: id ?? "" }),
        activeOrganizationId
      ),
    [activeOrganizationId, id]
  );

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const noteQuery = useGetNoteQuery(
    { id: id ?? "" },
    {
      queryKey: noteQueryKey,
      enabled: Boolean(id) && subscriptionEnabled
    }
  );

  const note = noteQuery.data?.note;

  const updateMutation = useUpdateNoteMutation();

  useEffect(() => {
    if (note && !dirty.current) {
      setTitle(note.title);
      setBody(note.body ?? "");
    }
  }, [note]);

  useSubscription({
    query: "subscription { noteUpdated { id } }",
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [noteQueryKey]
  });

  useSubscription({
    query: "subscription { todoCreated { id } }",
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [noteQueryKey]
  });

  useSubscription({
    query: "subscription { todoUpdated { id } }",
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [noteQueryKey]
  });

  useSubscription({
    query: "subscription { todoDeleted { id } }",
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [noteQueryKey]
  });

  useSubscription({
    query: "subscription { todoToggled { id } }",
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [noteQueryKey]
  });

  const isLoading = isOrganizationLoading || noteQuery.status === "pending";

  async function handleSave() {
    if (!note) {
      return;
    }

    try {
      setSaveStatus("idle");
      await updateMutation.mutateAsync({ id: note.id, input: { body, title } });
      dirty.current = false;
      setSaveStatus("saved");
      await queryClient.invalidateQueries({ queryKey: noteQueryKey });
    } catch {
      setSaveStatus("error");
    }
  }

  if (isLoading) {
    return <LoadingRows label={t("notes.loading")} />;
  }

  if (noteQuery.isError) {
    return (
      <div role="alert">
        <FieldError>{t("error.generic")}</FieldError>
        <Button onClick={() => void noteQuery.refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  if (!note) {
    return <p className="text-[color:var(--ds-text-subtle)]">{t("notes.notFound")}</p>;
  }

  const currentNote = note;

  return (
    <section className="ui-note-editor grid gap-[var(--ds-space-300)]">
      <NavLink className="text-[color:var(--ds-link)]" to="/notes">
        {t("notes.back")}
      </NavLink>
      <h1>{t("navigation.notes")}</h1>
      <div className="flex flex-col gap-[var(--ds-space-150)]">
        <Field>
          <FieldLabel htmlFor="note-title">{t("notes.titleLabel")}</FieldLabel>
          <Input
            id="note-title"
            value={title}
            disabled={updateMutation.isPending}
            onChange={(event) => {
              dirty.current = true;
              setSaveStatus("idle");
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="note-body">{t("notes.bodyLabel")}</FieldLabel>
          <Textarea
            id="note-body"
            value={body}
            disabled={updateMutation.isPending}
            onChange={(event) => {
              dirty.current = true;
              setSaveStatus("idle");
              setBody(event.target.value);
            }}
          />
        </Field>
        <div>
          <Button
            disabled={updateMutation.status === "pending"}
            type="button"
            onClick={() => {
              void handleSave();
            }}
          >
            {updateMutation.isPending ? t("notes.saving") : t("notes.save")}
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {saveStatus === "saved" ? t("notes.saved") : null}
        {saveStatus === "error" ? <FieldError>{t("error.generic")}</FieldError> : null}
      </div>
      <section className="flex flex-col gap-[var(--ds-space-150)]">
        <h2>{t("notes.checklist")}</h2>
        <NoteChecklist
          noteId={currentNote.id}
          todos={currentNote.todos}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: noteQueryKey });
          }}
        />
      </section>
    </section>
  );
}
