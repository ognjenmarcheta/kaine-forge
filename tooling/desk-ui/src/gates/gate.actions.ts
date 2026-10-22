import type { ActionName, ActionRequestInput } from "@repo/desk/contracts";
import { useCallback, useMemo, useState } from "react";

import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { runUndoable } from "../shell/shell.undo";
import { useDesk, type ActionSettled } from "../state/desk.provider";

/** Actions that wait in an undo window before they are sent. */
export const UNDOABLE_ACTIONS = [
  "approve",
  "feedback",
  "continue",
  "cancel",
  "remove"
] as const satisfies readonly ActionName[];

const isUndoable = (action: ActionName): boolean =>
  UNDOABLE_ACTIONS.some((undoable) => undoable === action);

/** How a run ended: as the server settled it, or undone before it was sent. */
export type RunResult = ActionSettled | { readonly kind: "undone" };

/** What the gate controls need from the page. A test supplies its own. */
export interface IssueActions {
  /** An action runs (here or in the engine). Controls that start work are disabled meanwhile. */
  readonly busy: boolean;
  readonly run: (request: ActionRequestInput) => Promise<RunResult>;
}

/**
 * Run actions of one issue. Each result is a toast, so no old note stays on the page. The
 * ship dialog shows its own result: a dry run must not read as a shipped issue. Approve,
 * feedback, continue, cancel, and remove wait in an undo window first; meanwhile the issue
 * counts as busy, so a second click cannot send twice.
 */
export function useIssueActions(issueNumber: number, engineBusy: boolean): IssueActions {
  const t = useT();
  const { act } = useDesk();
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async (request: ActionRequestInput): Promise<RunResult> => {
      setPending((count) => count + 1);
      try {
        let settled: ActionSettled;
        if (isUndoable(request.action)) {
          const outcome = await runUndoable({
            label: t(`desk.undo.pending.${request.action}`),
            issues: [issueNumber],
            send: ({ keepalive }) =>
              keepalive
                ? act(issueNumber, request, { wait: false, keepalive })
                : act(issueNumber, request)
          });
          if (outcome.kind === "undone") return outcome;
          settled = outcome.value;
        } else {
          settled = await act(issueNumber, request);
        }
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
