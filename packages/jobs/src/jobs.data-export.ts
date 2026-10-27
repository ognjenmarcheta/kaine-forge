import { z } from "zod";

import { defineJob } from "./jobs.definition";

export const DATA_EXPORT_JOB = defineJob({
  // Only the export id: the handler reads the requester and kind from the
  // data_exports row, so the payload holds no personal data.
  payload: z.object({ exportId: z.uuid() }),
  // The handler marks its export failed itself and does not throw, so there
  // is nothing to retry. API housekeeping fails an export whose job never
  // finished, such as one lost in a crash.
  retry: { limit: 0, delaySeconds: 0, backoff: false },
  // An export waits at most a day to start; housekeeping then fails it.
  retention: { deleteAfterSeconds: 60 * 60, pendingSeconds: 60 * 60 * 24 }
});

export type DataExportJobPayload = z.infer<typeof DATA_EXPORT_JOB.payload>;
