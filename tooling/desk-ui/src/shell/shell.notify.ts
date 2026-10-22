import type { IssueSummary } from "@repo/desk/contracts";
import { useEffect, useMemo, useRef } from "react";

import { useRouter } from "./shell.router";
import { useT } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";
import { statusLabelText } from "../status/status.chip";
import { isYourTurn, issueStatusOf, type BoardGroup } from "../status/status.model";

/** The issues that wait on the owner, with the board group that says why. */
export function useYourTurn(): ReadonlyMap<number, BoardGroup> {
  const { state } = useDesk();
  return useMemo(() => {
    const turn = new Map<number, BoardGroup>();
    for (const summary of Object.values(state.issues)) {
      const { group } = issueStatusOf(summary);
      if (isYourTurn(group)) turn.set(summary.issueNumber, group);
    }
    return turn;
  }, [state.issues]);
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
 * A browser notification when an issue newly reaches the owner's turn: it stopped (Needs
 * you) or waits at a gate. The first load only sets the baseline, so opening the page never
 * notifies. Nothing is shown unless `enabled` and the browser granted permission.
 */
export function useTurnNotifications(enabled: boolean): void {
  const t = useT();
  const { state } = useDesk();
  const { navigate } = useRouter();
  const turn = useYourTurn();
  const seen = useRef<ReadonlyMap<number, BoardGroup> | null>(null);

  useEffect(() => {
    if (!state.issuesLoaded) return;
    const before = seen.current;
    seen.current = turn;
    if (before === null || !enabled) return;
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    for (const [issueNumber, group] of turn) {
      if (before.get(issueNumber) === group) continue;
      const summary: IssueSummary | undefined = state.issues[issueNumber];
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
