import type { ActionRequestInput } from "@repo/desk/contracts";
import { useCallback, useMemo, useState } from "react";

import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { useDesk, type ActionSettled } from "../state/desk.provider";

/** What the gate controls need from the page. A test supplies its own. */
export interface IssueActions {
  /** An action runs (here or in the engine). Controls that start work are disabled meanwhile. */
  readonly busy: boolean;
  readonly run: (request: ActionRequestInput) => Promise<ActionSettled>;
}

/**
 * Run actions of one issue. Each result is a toast, so no old note stays on the page. The
 * ship dialog shows its own result: a dry run must not read as a shipped issue.
 */
export function useIssueActions(issueNumber: number, engineBusy: boolean): IssueActions {
  const t = useT();
  const { act } = useDesk();
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async (request: ActionRequestInput): Promise<ActionSettled> => {
      setPending((count) => count + 1);
      try {
        const settled = await act(issueNumber, request);
        if (request.action !== "ship") toastSettled(t, issueNumber, request.action, settled);
        return settled;
      } finally {
        setPending((count) => count - 1);
      }
    },
    [act, issueNumber, t]
  );

  return useMemo(() => ({ busy: engineBusy || pending > 0, run }), [engineBusy, pending, run]);
}
