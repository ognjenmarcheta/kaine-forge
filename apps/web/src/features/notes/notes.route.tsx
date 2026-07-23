import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, FieldError, Input } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { NOTES_CONFIG } from "./notes.config";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useGetNotesQuery
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("notes.web.list", useGetNotesQuery.getKey());

export function NotesRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [newTitle, setNewTitle] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const listVariables = useMemo(() => ({ limit: NOTES_CONFIG.pageSize, offset: 0 }), []);
  const notesQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGetNotesQuery.getKey(listVariables),
        activeOrganizationId
      ),
    [activeOrganizationId, listVariables]
  );

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const notesQuery = useGetNotesQuery(listVariables, {
    queryKey: notesQueryKey,
    enabled: subscriptionEnabled
  });

  const createMutation = useCreateNoteMutation();
  const deleteMutation = useDeleteNoteMutation();

  useSubscription({
    query: "subscription { noteCreated { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [notesQueryKey]
  });

  useSubscription({
    query: "subscription { noteUpdated { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [notesQueryKey]
  });

  useSubscription({
    query: "subscription { noteDeleted { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [notesQueryKey]
  });

  const notes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTitle.trim();

    if (title.length === 0) {
      return;
    }

    const result = await createMutation.mutateAsync({ input: { title } });
    setNewTitle("");
    void navigate(`/notes/${result.createNote.id}`);
  }

  async function confirmDelete() {
    if (!deletingNoteId) {
      return;
    }

    await deleteMutation.mutateAsync({ id: deletingNoteId });
    setDeletingNoteId(null);
    await queryClient.invalidateQueries({ queryKey: notesQueryKey });
  }

  const isLoading = isOrganizationLoading || notesQuery.status === "pending";
  const error = notesQuery.error ? t("error.generic") : null;

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header className="flex items-center justify-between gap-[var(--ds-space-150)]">
        <h1>{t("notes.title")}</h1>
      </header>

      <form
        className="flex items-center gap-[var(--ds-space-100)]"
        onSubmit={(event) => void handleCreate(event)}
      >
        <Input
          placeholder={t("notes.titleLabel")}
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <Button disabled={createMutation.status === "pending"} type="submit">
          {t("notes.create")}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-[color:var(--ds-text-subtle)]">{t("notes.loading")}</p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}

      {!isLoading && notes.length === 0 ? (
        <p className="text-[color:var(--ds-text-subtle)]">{t("notes.empty")}</p>
      ) : null}

      {!isLoading && notes.length > 0 ? (
        <ul className="flex flex-col gap-[var(--ds-space-100)]">
          {notes.map((note) => {
            const preview = (note.body ?? "").split("\n")[0] ?? "";

            return (
              <li key={note.id}>
                <div className="flex items-center justify-between gap-[var(--ds-space-150)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-150)]">
                  <NavLink
                    className="flex min-w-0 flex-1 flex-col gap-[var(--ds-space-050)]"
                    to={`/notes/${note.id}`}
                  >
                    <span className="truncate">{note.title}</span>
                    {preview ? (
                      <span className="truncate text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
                        {preview}
                      </span>
                    ) : null}
                  </NavLink>
                  <Button
                    appearance="subtle"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeletingNoteId(note.id);
                    }}
                  >
                    {t("notes.delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteMutation.status === "pending"}
        isOpen={Boolean(deletingNoteId)}
        message={t("notes.deleteConfirmMessage")}
        title={t("notes.deleteConfirmTitle")}
        onCancel={() => setDeletingNoteId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
