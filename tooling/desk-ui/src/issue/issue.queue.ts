import { useMemo } from "react";

import { useWorkItems } from "../shell/shell.notify";
import { useRouter } from "../shell/shell.router";
import { TURN_GROUPS, inboxGroups } from "../work/work.model";
import { routeOf } from "../work/work.present";

export interface TurnQueue {
  /** The 1-based place of this item in the Inbox, or `null` when it does not wait on the owner. */
  readonly position: number | null;
  readonly total: number;
  /** Open the next (1) or previous (-1) decision, wrapping around. */
  readonly step: (direction: 1 | -1) => void;
}

/**
 * The work that waits on the owner, in the order of the Inbox: what stopped, the decisions at
 * a gate, then the PRs to merge, oldest first. J and K walk it without going back to the Inbox.
 */
export function useTurnQueue(key: string): TurnQueue {
  const items = useWorkItems();
  const { navigate } = useRouter();
  const queue = useMemo(() => {
    const groups = inboxGroups(items);
    return TURN_GROUPS.flatMap((group) => groups[group]);
  }, [items]);
  const index = queue.findIndex((item) => item.key === key);

  const step = (direction: 1 | -1): void => {
    if (queue.length === 0) return;
    const next =
      index < 0
        ? direction > 0
          ? 0
          : queue.length - 1
        : (index + direction + queue.length) % queue.length;
    const target = queue[next];
    if (target !== undefined && target.key !== key) navigate(routeOf(target));
  };

  return { position: index < 0 ? null : index + 1, total: queue.length, step };
}
