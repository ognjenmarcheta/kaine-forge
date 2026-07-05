import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { notesTable } from "../schema/notes.schema";

export type Note = InferSelectModel<typeof notesTable>;
export type NewNote = InferInsertModel<typeof notesTable>;
