import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { sessionsTable } from "../schema/sessions.schema";

export type Session = InferSelectModel<typeof sessionsTable>;
export type NewSession = InferInsertModel<typeof sessionsTable>;
