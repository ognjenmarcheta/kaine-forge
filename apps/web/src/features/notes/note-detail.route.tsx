import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, Field, FieldLabel, Input, Textarea } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { NoteChecklist } from "./components/note-checklist";
import { useGetNoteQuery, useUpdateNoteMutation } from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";

export function NoteDetailRoute() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

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
    if (note) {
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

    await updateMutation.mutateAsync({ id: note.id, input: { body, title } });
    await queryClient.invalidateQueries({ queryKey: noteQueryKey });
  }

  if (isLoading) {
    return <p className="text-[color:var(--ds-text-subtle)]">{t("notes.loading")}</p>;
  }

  if (!note) {
    return <p className="text-[color:var(--ds-text-subtle)]">{t("notes.notFound")}</p>;
  }

  const currentNote = note;

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <div className="flex flex-col gap-[var(--ds-space-150)]">
        <Field>
          <FieldLabel htmlFor="note-title">{t("notes.titleLabel")}</FieldLabel>
          <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="note-body">{t("notes.bodyLabel")}</FieldLabel>
          <Textarea id="note-body" value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <div>
          <Button
            disabled={updateMutation.status === "pending"}
            type="button"
            onClick={() => {
              void handleSave();
            }}
          >
            {t("notes.save")}
          </Button>
        </div>
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
