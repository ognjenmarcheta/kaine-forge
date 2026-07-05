import type { GetNoteQuery, GetNotesQuery } from "../../graphql/generated/react-query";

export type NoteListItem = GetNotesQuery["notes"][number];
export type NoteDetail = NonNullable<GetNoteQuery["note"]>;
export type NoteTodo = NoteDetail["todos"][number];
