import { useEffect, useMemo, useRef } from "react";

import { useRouter } from "./shell.router";
import { useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";
import { statusLabelText } from "../status/status.chip";
import { isYourTurn, issueStatusOf, type InboxGroup } from "../status/status.model";
import { workItems, type WorkItem } from "../work/work.model";

/** Every issue and desk job on the desk, as work items. */
export function useWorkItems(): readonly WorkItem[] {
  const { state } = useDesk();
  return useMemo(() => workItems(state.issues, state.jobs), [state.issues, state.jobs]);
}

/** The work that waits on the owner, by item key, with the Inbox group that says why. */
export function useYourTurn(): ReadonlyMap<string, WorkItem> {
  const items = useWorkItems();
  return useMemo(() => {
    const turn = new Map<string, WorkItem>();
    for (const item of items) if (isYourTurn(item.group)) turn.set(item.key, item);
    return turn;
  }, [items]);
}

/** "(3) Agent Desk" while three issues wait on you, else "Agent Desk", in the page language. */
export function useDocumentTitle(count: number): void {
  const t = useT();
  const title = count > 0 ? t("desk.title.count", { count }) : t("desk.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export const notificationsSupported = (): boolean => typeof Notification !== "undefined";

/**
 * A browser notification when an issue newly reaches the owner's turn: it stopped or waits
 * at a gate. The first load only sets the baseline, so opening the page never
 * notifies. Nothing is shown unless `enabled` and the browser granted permission.
 */
export function useTurnNotifications(enabled: boolean): void {
  const t = useT();
  const { state } = useDesk();
  const { navigate } = useRouter();
  const turn = useYourTurn();
  const seen = useRef<ReadonlyMap<number, InboxGroup> | null>(null);

  useEffect(() => {
    if (!state.issuesLoaded) return;
    const before = seen.current;
    const now = new Map<number, InboxGroup>();
    for (const item of turn.values()) {
      // Stopped and Your turn notify; a PR waiting on GitHub does not.
      if (item.kind === "issue" && item.group !== "github") {
        now.set(item.summary.issueNumber, item.group);
      }
    }
    seen.current = now;
    if (before === null || !enabled) return;
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    for (const [issueNumber, group] of now) {
      if (before.get(issueNumber) === group) continue;
      const summary = state.issues[issueNumber];
      if (summary === undefined) continue;
      const notification = new Notification(
        t("desk.issue.numbered", {
          number: issueNumber,
          title: summary.readable ? (summary.title ?? t("desk.issue.untitled")) : ""
        }).trim(),
        {
          body: statusLabelText(t, issueStatusOf(summary).label),
          tag: `desk-${String(issueNumber)}`
        }
      );
      notification.onclick = () => {
        window.focus();
        navigate({ view: "issue", issueNumber });
      };
    }
  }, [turn, enabled, state.issuesLoaded, state.issues, t, navigate]);
}
