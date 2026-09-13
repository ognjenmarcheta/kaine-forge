import type { NoteDraft, NoteListItem } from "./notes.type";

export const NEW_NOTE = "new";

export function createNoteDraft(note?: NoteListItem): NoteDraft {
  return {
    title: note?.title ?? "",
    body: note?.body ?? "",
    baseTitle: note?.title ?? "",
    baseBody: note?.body ?? "",
    serverId: note?.id ?? null,
    status: "idle",
    deleted: false
  };
}

export function isNoteDirty(draft: NoteDraft): boolean {
  return draft.title !== draft.baseTitle || draft.body !== draft.baseBody;
}

export function canSaveNote(draft: NoteDraft): boolean {
  const length = draft.title.trim().length;
  return (
    !draft.deleted &&
    draft.status !== "saving" &&
    length > 0 &&
    length <= 255 &&
    (isNoteDirty(draft) || draft.serverId === null)
  );
}
