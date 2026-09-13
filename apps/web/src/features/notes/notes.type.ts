import type { GetNoteQuery, GetNotesQuery } from "../../graphql/generated/react-query";

export type NoteListItem = GetNotesQuery["notes"][number];
export type NoteDetail = NonNullable<GetNoteQuery["note"]>;
export type NoteTodo = NoteDetail["todos"][number];

export interface NoteDraft {
  title: string;
  body: string;
  baseTitle: string;
  baseBody: string;
  serverId: string | null;
  status: "idle" | "saving" | "saved" | "error";
  deleted: boolean;
}
