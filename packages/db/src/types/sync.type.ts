import type { InferSelectModel } from "drizzle-orm";

import { syncTombstonesTable } from "../schema/sync.schema";

export type SyncTombstone = InferSelectModel<typeof syncTombstonesTable>;

/** How the server answered one mutation of a sync push. */
export interface SyncMutationOutcome {
  status: "APPLIED" | "REJECTED";
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "PLAN_LIMIT_REACHED" | null;
}
