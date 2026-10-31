import { createActiveOrganizationQueryKey } from "@repo/query";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { NOTES_CONFIG } from "./notes.config";
import type { NoteDetail, NoteDraft } from "./notes.type";
import { canSaveNote, createNoteDraft, isNoteDirty, NEW_NOTE } from "./notes.util";
import {
  useGetNotesQuery,
  useGetNoteQuery,
  useNoteCountQuery
} from "../../graphql/generated/react-query";
import { useLiveNotes, useLiveTodos } from "../../hooks/use-live-list";
import { useSyncEngine, useSyncStatus } from "../../hooks/use-sync";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("notes.web.list", useGetNotesQuery.getKey());
const detailPrefix = useGetNoteQuery.getKey({ id: "" }).slice(0, 1);
queryRuntime.registerOrgScopedOperation("notes.web.detail", detailPrefix);
queryRuntime.registerOrgScopedOperation("notes.web.count", useNoteCountQuery.getKey());

/** The number of Notes in the Active Organization. */
export function useNoteCount(organizationId: string | null, enabled: boolean) {
  return useNoteCountQuery(undefined, {
    enabled,
    queryKey: createActiveOrganizationQueryKey(useNoteCountQuery.getKey(), organizationId)
  });
}

/**
 * The Active Organization's Notes and their checklists from the local sync
 * collections. Saving and deleting work offline: a write shows at once and
 * syncs when the network allows; one the server refuses rolls back with a
 * toast (sync.provider).
 */
export function useNotes(organizationId: string | null, enabled: boolean, selected: string | null) {
  const client = useQueryClient();
  const engine = useSyncEngine();
  const syncStatus = useSyncStatus();
  const [search, setSearch] = useState("");
  const [phrase, setPhrase] = useState("");
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({});
  const draftsRef = useRef(drafts);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [visible, setVisible] = useState<number>(NOTES_CONFIG.pageSize);
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

  const liveNotes = useLiveQuery(() => (enabled ? engine?.notes : null), [engine, enabled]);
  const liveTodos = useLiveQuery(() => (enabled ? engine?.todos : null), [engine, enabled]);
  const ready = liveNotes.isReady;
  const all = [...(liveNotes.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lowerPhrase = phrase.toLowerCase();
  const matching = all.filter(
    (note) =>
      note.title.toLowerCase().includes(lowerPhrase) ||
      (note.body ?? "").toLowerCase().includes(lowerPhrase)
  );
  useEffect(() => {
    setVisible(NOTES_CONFIG.pageSize);
  }, [phrase]);
  // The list's loading and paging state, in the shape the routes read. With
  // no rows to show, a failed pull is a load error the user can retry.
  const list = {
    isPending: !ready,
    isError: ready && all.length === 0 && syncStatus?.state === "error",
    isFetchNextPageError: false,
    hasNextPage: matching.length > visible,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {
      setVisible((count) => count + NOTES_CONFIG.pageSize);
    },
    refetch: () => engine?.pull().catch(() => undefined)
  };
  const selectedDraft = selected ? drafts[selected] : undefined;
  const serverId = selectedDraft?.serverId ?? (selected === NEW_NOTE ? null : selected);
  const savedNote = serverId ? all.find((note) => note.id === serverId) : undefined;
  const note: NoteDetail | null = savedNote
    ? {
        ...savedNote,
        todos: (liveTodos.data ?? [])
          .filter((todo) => todo.noteId === savedNote.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }
    : null;
  // The selected Note's state, in the shape the detail route reads.
  const detail = {
    data: ready && serverId ? { note } : undefined,
    isError: list.isError,
    isSuccess: ready && Boolean(serverId),
    refetch: () => engine?.pull().catch(() => undefined)
  };

  useEffect(() => {
    if (!selected) return;
    const current = draftsRef.current[selected];
    if (selected === NEW_NOTE && !current) {
      changeDrafts((drafts) => ({ ...drafts, [NEW_NOTE]: createNoteDraft() }));
    } else if (savedNote && current?.status !== "saving") {
      if (!current || !isNoteDirty(current)) {
        changeDrafts((drafts) => ({
          ...drafts,
          [selected]: { ...createNoteDraft(savedNote), status: current?.status ?? "idle" }
        }));
      }
    } else if (serverId && ready && !savedNote && current) {
      patchDraft(selected, { deleted: true });
    }
  }, [selected, serverId, savedNote, ready]);

  const countKey = useNoteCountQuery.getKey();
  const pull = () => void engine?.pull().catch(() => undefined);
  useLiveNotes({
    enabled,
    invalidateKeys: [countKey],
    onDeleted: (id) =>
      changeDrafts((drafts) =>
        Object.fromEntries(
          Object.entries(drafts).map(([key, draft]) => [
            key,
            draft.serverId === id ? { ...draft, deleted: true } : draft
          ])
        )
      ),
    onEvent: pull
  });
  // A Note's checklist changes through Todo events.
  useLiveTodos({ enabled, invalidateKeys: [], onEvent: pull });

  async function refresh() {
    await Promise.all([engine?.pull(), client.invalidateQueries({ queryKey: countKey })]);
  }
  async function save(key: string) {
    const submitted = draftsRef.current[key];
    if (!enabled || !engine || !submitted || !canSaveNote(submitted) || locks.current.has(key))
      return;
    locks.current.add(key);
    patchDraft(key, { status: "saving" });
    try {
      // Normalized as the server stores it, so the synced row matches the draft.
      const body = submitted.body.trim();
      const input = { title: submitted.title.trim(), body: body.length > 0 ? body : null };
      let id = submitted.serverId;
      if (id) await engine.updateNote(id, input);
      else id = await engine.createNote(input);
      if (!mounted.current) return;
      const savedId = id;
      changeDrafts((drafts) => {
        const latest = drafts[key];
        if (!latest) return drafts;
        return {
          ...drafts,
          [key]: {
            ...latest,
            serverId: savedId,
            baseTitle: input.title,
            baseBody: input.body ?? "",
            title: latest.title === submitted.title ? input.title : latest.title,
            body: latest.body === submitted.body ? (input.body ?? "") : latest.body,
            status: "saved"
          }
        };
      });
      void client.invalidateQueries({ queryKey: countKey });
    } catch {
      if (mounted.current) patchDraft(key, { status: "error" });
    } finally {
      locks.current.delete(key);
    }
  }
  async function deleteNote(id: string) {
    if (!engine || locks.current.size || deletePending) return false;
    locks.current.add(id);
    setDeleteError(false);
    setDeletePending(true);
    try {
      await engine.deleteNote(id);
      if (!mounted.current) return false;
      changeDrafts((drafts) =>
        Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.serverId !== id))
      );
      setDeleting(null);
      void client.invalidateQueries({ queryKey: countKey });
      return true;
    } catch {
      if (mounted.current) setDeleteError(true);
      return false;
    } finally {
      locks.current.delete(id);
      if (mounted.current) setDeletePending(false);
    }
  }
  function startNew() {
    const previous = draftsRef.current[NEW_NOTE];
    if (previous?.serverId) {
      changeDrafts((drafts) => ({
        ...drafts,
        [previous.serverId ?? NEW_NOTE]: previous,
        [NEW_NOTE]: createNoteDraft()
      }));
    } else if (!previous) changeDrafts((drafts) => ({ ...drafts, [NEW_NOTE]: createNoteDraft() }));
  }
  const rows = matching.slice(0, visible);
  const unsaved = Object.entries(drafts).filter(
    ([, draft]) => isNoteDirty(draft) || draft.status === "saving" || draft.status === "error"
  );
  const pending = Object.values(drafts).some((draft) => draft.status === "saving") || deletePending;
  const externalChange = Boolean(
    selectedDraft &&
    savedNote &&
    !selectedDraft.deleted &&
    selectedDraft.status !== "saving" &&
    (selectedDraft.baseTitle !== savedNote.title ||
      selectedDraft.baseBody !== (savedNote.body ?? ""))
  );

  return {
    promoteNew: () => {
      const draft = draftsRef.current[NEW_NOTE];
      if (!draft?.serverId || draft.status === "saving") return;
      changeDrafts((drafts) => {
        const next = { ...drafts, [draft.serverId ?? NEW_NOTE]: draft };
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
    deletePending,
    edit: (key: string, field: "title" | "body", value: string) =>
      patchDraft(key, { [field]: value }),
    loadLatest: () => {
      if (selected && savedNote)
        changeDrafts((drafts) => ({ ...drafts, [selected]: createNoteDraft(savedNote) }));
    },
    refresh
  };
}
