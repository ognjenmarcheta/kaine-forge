import type { ActionRequestInput } from "@repo/desk/contracts";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useT } from "../i18n/i18n.t";
import { toastSettled } from "../shell/shell.toast";
import { runUndoable, type SendOptions } from "../shell/shell.undo";
import { useDesk, type ActionSettled } from "../state/desk.provider";

const APPROVE = { action: "approve" } as const satisfies ActionRequestInput;
const CONTINUE = { action: "continue" } as const satisfies ActionRequestInput;

const issueList = (numbers: readonly number[]): string =>
  numbers.map((n) => `#${String(n)}`).join(", ");

/** Send one action without waiting for its end: the board shows the change when it comes. */
function useSend(): (
  issueNumber: number,
  request: ActionRequestInput,
  options: SendOptions
) => Promise<ActionSettled> {
  const { act } = useDesk();
  return useCallback(
    (issueNumber, request, { keepalive }) =>
      keepalive
        ? act(issueNumber, request, { wait: false, keepalive })
        : act(issueNumber, request, { wait: false }),
    [act]
  );
}

/** Continue a stopped issue from the board, after the undo window. */
export function useContinueIssue(): (issueNumber: number) => Promise<void> {
  const t = useT();
  const send = useSend();
  return useCallback(
    async (issueNumber) => {
      const outcome = await runUndoable({
        label: t("desk.undo.pending.continue"),
        issues: [issueNumber],
        send: (options) => send(issueNumber, CONTINUE, options)
      });
      if (outcome.kind === "sent") toastSettled(t, issueNumber, "continue", outcome.value);
    },
    [send, t]
  );
}

export interface ApprovePlans {
  /** Issues whose approval waits in its undo window. */
  readonly pending: ReadonlySet<number>;
  /** Approve plans: one undo toast for all, then one request after another. */
  readonly approve: (issues: readonly number[]) => void;
}

/**
 * Approve plans from the board. Several plans share one undo window: Undo keeps every plan at
 * its gate. After the window the requests go out one by one, and one toast reports the result,
 * naming the plans that failed.
 */
export function useApprovePlans(): ApprovePlans {
  const t = useT();
  const send = useSend();
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());

  const approve = useCallback(
    (issues: readonly number[]): void => {
      const [first] = issues;
      if (first === undefined) return;
      const batch = issues.length > 1;
      setPending((was) => new Set([...was, ...issues]));
      void runUndoable({
        label: batch
          ? t("desk.board.batch.pending", { count: issues.length })
          : t("desk.undo.pending.approve"),
        issues,
        send: async (options) => {
          const results: { readonly issueNumber: number; readonly settled: ActionSettled }[] = [];
          for (const issueNumber of issues) {
            results.push({ issueNumber, settled: await send(issueNumber, APPROVE, options) });
          }
          return results;
        }
      })
        .then((outcome) => {
          if (outcome.kind === "undone") return;
          if (!batch) {
            const [only] = outcome.value;
            if (only !== undefined) toastSettled(t, first, "approve", only.settled);
            return;
          }
          const failed = outcome.value.filter((result) => result.settled.kind === "error");
          if (failed.length === 0) {
            toast.success(t("desk.board.batch.done", { issues: issueList(issues) }));
            return;
          }
          const [firstFailure] = failed;
          const detail =
            firstFailure?.settled.kind === "error" ? firstFailure.settled.detail : null;
          toast.error(
            t("desk.board.batch.failed", {
              failed: issueList(failed.map((result) => result.issueNumber)),
              count: failed.length,
              total: issues.length
            }),
            {
              ...(detail === null ? {} : { description: detail }),
              duration: Number.POSITIVE_INFINITY
            }
          );
        })
        .finally(() =>
          setPending((was) => new Set([...was].filter((issue) => !issues.includes(issue))))
        );
    },
    [send, t]
  );

  return { pending, approve };
}
