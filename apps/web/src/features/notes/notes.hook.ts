import { createActiveOrganizationQueryKey } from "@repo/query";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { NOTES_CONFIG } from "./notes.config";
import type { NoteDraft } from "./notes.type";
import { canSaveNote, createNoteDraft, isNoteDirty, NEW_NOTE } from "./notes.util";
import {
  GetNotesDocument,
  useGetNotesQuery,
  useGetNoteQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  type GetNotesQuery,
  type GetNotesQueryVariables
} from "../../graphql/generated/react-query";
import { useSubscription } from "../../hooks/use-subscription";
import { useGraphqlFetcher } from "../../lib/graphql-codegen-fetcher";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("notes.web.list", useGetNotesQuery.getKey());
const detailPrefix = useGetNoteQuery.getKey({ id: "" }).slice(0, 1);
queryRuntime.registerOrgScopedOperation("notes.web.detail", detailPrefix);

export function useNotes(organizationId: string | null, enabled: boolean, selected: string | null) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [phrase, setPhrase] = useState("");
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({});
  const draftsRef = useRef(drafts);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const mounted = useRef(false);
  const locks = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setPhrase(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function changeDrafts(change: (current: Record<string, NoteDraft>) => Record<string, NoteDraft>) {
    const next = change(draftsRef.current);
    draftsRef.current = next;
    setDrafts(next);
  }
  function patchDraft(key: string, patch: Partial<NoteDraft>) {
    changeDrafts((current) => {
      const draft = current[key];
      return draft ? { ...current, [key]: { ...draft, ...patch } } : current;
    });
  }

  const fetchNotes = useGraphqlFetcher<GetNotesQuery, GetNotesQueryVariables>(GetNotesDocument);
  const listKey = createActiveOrganizationQueryKey(
    [...useGetNotesQuery.getKey({ search: phrase, limit: NOTES_CONFIG.pageSize }), "pages"],
    organizationId
  );
  const list = useInfiniteQuery({
    queryKey: listKey,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchNotes({ search: phrase, limit: NOTES_CONFIG.pageSize, offset: pageParam }),
    getNextPageParam: (last, pages) =>
      last.notes.length === NOTES_CONFIG.pageSize ? pages.length * NOTES_CONFIG.pageSize : undefined
  });
  const selectedDraft = selected ? drafts[selected] : undefined;
  const serverId = selectedDraft?.serverId ?? (selected === NEW_NOTE ? null : selected);
  const detailKey = createActiveOrganizationQueryKey(
    useGetNoteQuery.getKey({ id: serverId ?? "" }),
    organizationId
  );
  const detail = useGetNoteQuery(
    { id: serverId ?? "" },
    { enabled: enabled && Boolean(serverId), queryKey: detailKey }
  );
  const create = useCreateNoteMutation({ retry: false });
  const update = useUpdateNoteMutation({ retry: false });
  const remove = useDeleteNoteMutation({ retry: false });

  useEffect(() => {
    if (!selected) return;
    const current = draftsRef.current[selected];
    if (selected === NEW_NOTE && !current) {
      changeDrafts((all) => ({ ...all, [NEW_NOTE]: createNoteDraft() }));
    } else if (
      detail.data?.note &&
      detail.data.note.id === serverId &&
      current?.status !== "saving"
    ) {
      const note = detail.data.note;
      if (!current || !isNoteDirty(current)) {
        changeDrafts((all) => ({
          ...all,
          [selected]: { ...createNoteDraft(note), status: current?.status ?? "idle" }
        }));
      }
    } else if (serverId && detail.isSuccess && detail.data.note === null && current) {
      patchDraft(selected, { deleted: true });
    }
  }, [selected, serverId, detail.data, detail.isSuccess]);

  const invalidationKeys = [listKey, detailKey];
  useSubscription({
    query: "subscription { noteCreated { id } }",
    enabled,
    invalidateKeys: invalidationKeys
  });
  useSubscription({
    query: "subscription { noteUpdated { id } }",
    enabled,
    invalidateKeys: invalidationKeys
  });
  useSubscription<{ noteDeleted: { id: string } }>({
    query: "subscription { noteDeleted { id } }",
    enabled,
    invalidateKeys: invalidationKeys,
    onData: ({ noteDeleted }) =>
      changeDrafts((all) =>
        Object.fromEntries(
          Object.entries(all).map(([key, draft]) => [
            key,
            draft.serverId === noteDeleted.id ? { ...draft, deleted: true } : draft
          ])
        )
      )
  });
  useSubscription({
    query: "subscription { todoCreated { id } }",
    enabled,
    invalidateKeys: [detailKey]
  });
  useSubscription({
    query: "subscription { todoUpdated { id } }",
    enabled,
    invalidateKeys: [detailKey]
  });
  useSubscription({
    query: "subscription { todoDeleted { id } }",
    enabled,
    invalidateKeys: [detailKey]
  });
  useSubscription({
    query: "subscription { todoToggled { id } }",
    enabled,
    invalidateKeys: [detailKey]
  });

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: useGetNotesQuery.getKey() }),
      client.invalidateQueries({ queryKey: detailPrefix })
    ]);
  }
  async function save(key: string) {
    const submitted = draftsRef.current[key];
    if (!enabled || !submitted || !canSaveNote(submitted) || locks.current.has(key)) return;
    locks.current.add(key);
    patchDraft(key, { status: "saving" });
    try {
      const input = { title: submitted.title.trim(), body: submitted.body };
      const result = submitted.serverId
        ? (await update.mutateAsync({ id: submitted.serverId, input })).updateNote
        : (await create.mutateAsync({ input })).createNote;
      if (!mounted.current) return;
      changeDrafts((all) => {
        const latest = all[key];
        if (!latest) return all;
        return {
          ...all,
          [key]: {
            ...latest,
            serverId: result.id,
            baseTitle: result.title,
            baseBody: result.body ?? "",
            title: latest.title === submitted.title ? result.title : latest.title,
            body: latest.body === submitted.body ? (result.body ?? "") : latest.body,
            status: "saved"
          }
        };
      });
      await refresh();
    } catch {
      if (mounted.current) patchDraft(key, { status: "error" });
    } finally {
      locks.current.delete(key);
    }
  }
  async function deleteNote(id: string) {
    if (locks.current.size || remove.isPending) return false;
    locks.current.add(id);
    setDeleteError(false);
    try {
      await remove.mutateAsync({ id });
      if (!mounted.current) return false;
      changeDrafts((all) =>
        Object.fromEntries(Object.entries(all).filter(([, draft]) => draft.serverId !== id))
      );
      setDeleting(null);
      await refresh();
      return mounted.current;
    } catch {
      if (mounted.current) setDeleteError(true);
      return false;
    } finally {
      locks.current.delete(id);
    }
  }
  function startNew() {
    const previous = draftsRef.current[NEW_NOTE];
    if (previous?.serverId) {
      changeDrafts((all) => ({
        ...all,
        [previous.serverId ?? NEW_NOTE]: previous,
        [NEW_NOTE]: createNoteDraft()
      }));
    } else if (!previous) changeDrafts((all) => ({ ...all, [NEW_NOTE]: createNoteDraft() }));
  }
  const rows = [
    ...new Map(
      (list.data?.pages.flatMap((page) => page.notes) ?? []).map((note) => [note.id, note])
    ).values()
  ];
  const unsaved = Object.entries(drafts).filter(
    ([, draft]) => isNoteDirty(draft) || draft.status === "saving" || draft.status === "error"
  );
  const pending =
    Object.values(drafts).some((draft) => draft.status === "saving") || remove.isPending;
  const externalChange = Boolean(
    selectedDraft &&
    detail.data?.note &&
    !selectedDraft.deleted &&
    selectedDraft.status !== "saving" &&
    (selectedDraft.baseTitle !== detail.data.note.title ||
      selectedDraft.baseBody !== (detail.data.note.body ?? ""))
  );

  return {
    promoteNew: () => {
      const draft = draftsRef.current[NEW_NOTE];
      if (!draft?.serverId || draft.status === "saving") return;
      changeDrafts((all) => {
        const next = { ...all, [draft.serverId ?? NEW_NOTE]: draft };
        delete next[NEW_NOTE];
        return next;
      });
    },
    search,
    setSearch,
    phrase,
    list,
    rows,
    detail,
    serverId,
    drafts,
    draft: selectedDraft,
    unsaved,
    pending,
    externalChange,
    save,
    startNew,
    deleteNote,
    deleting,
    setDeleting,
    deleteError,
    deletePending: remove.isPending,
    edit: (key: string, field: "title" | "body", value: string) =>
      patchDraft(key, { [field]: value }),
    loadLatest: () => {
      if (selected && detail.data?.note)
        changeDrafts((all) => ({
          ...all,
          [selected]: createNoteDraft(detail.data.note ?? undefined)
        }));
    },
    refresh
  };
}
