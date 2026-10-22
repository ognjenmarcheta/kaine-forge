import { useMemo } from "react";

import { groupIssues, yourTurn } from "../board/board.grouping";
import { useRouter } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";

export interface TurnQueue {
  /** The 1-based place of this issue in Your turn, or `null` when it does not wait on the owner. */
  readonly position: number | null;
  readonly total: number;
  /** Open the next (1) or previous (-1) decision, wrapping around. */
  readonly step: (direction: 1 | -1) => void;
}

/**
 * The issues that wait on the owner, in the order of the Your turn board: what stopped, then
 * the decisions at a gate, oldest first. J and K walk it without going back to the board.
 */
export function useTurnQueue(issueNumber: number): TurnQueue {
  const { state } = useDesk();
  const { navigate } = useRouter();
  const queue = useMemo(() => {
    const turn = yourTurn(groupIssues(Object.values(state.issues)));
    return [...turn.needsYou, ...turn.decisions].map((summary) => summary.issueNumber);
  }, [state.issues]);
  const index = queue.indexOf(issueNumber);

  const step = (direction: 1 | -1): void => {
    if (queue.length === 0) return;
    const next =
      index < 0
        ? direction > 0
          ? 0
          : queue.length - 1
        : (index + direction + queue.length) % queue.length;
    const target = queue[next];
    if (target !== undefined && target !== issueNumber)
      navigate({ view: "issue", issueNumber: target });
  };

  return { position: index < 0 ? null : index + 1, total: queue.length, step };
}
