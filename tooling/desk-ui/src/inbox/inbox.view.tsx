import type { GithubPull } from "@repo/desk/contracts";
import { Button, Kbd } from "@repo/ui";
import { Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useApprovePlans, useContinueIssue } from "./inbox.actions";
import { FirstRunGuide, isFirstRun } from "./inbox.guide";
import { InboxRow } from "./inbox.row";
import { FinishedPanel, RunningPanel } from "./inbox.side";
import { useUnread } from "./inbox.unread";
import { ApproveBatchDialog } from "../gates/gate.confirm";
import { useGithubLists } from "../github/github.use";
import { useT } from "../i18n/i18n.t";
import { keyLabel, useShortcuts } from "../shell/shell.keys";
import { useNewWork } from "../shell/shell.newwork";
import { useWorkItems } from "../shell/shell.notify";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink, useRouter } from "../shell/shell.router";
import { toastSettled } from "../shell/shell.toast";
import { Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { gatePlanRisk, issueStatusOf, isLowRiskPlan } from "../status/status.model";
import { TURN_GROUPS, inboxGroups, type WorkItem } from "../work/work.model";
import { titleOf } from "../work/work.present";

/**
 * A start that the engine refused after it answered `accepted` never puts work on the desk.
 * Its `action-result` arrives later, and this shows it as a toast, once.
 */
function useRefusedStartToasts(): void {
  const t = useT();
  const { state } = useDesk();
  // Results that arrived before this page mounted were reported then; do not repeat them.
  const [seen] = useState(() => new Set(Object.values(state.notes).map((note) => note.seq)));
  useEffect(() => {
    for (const [key, note] of Object.entries(state.notes)) {
      const issueNumber = Number(key);
      if (note.action !== "start" || note.error === null || seen.has(note.seq)) continue;
      if (state.issues[issueNumber] !== undefined) continue;
      seen.add(note.seq);
      toastSettled(t, issueNumber, "start", {
        kind: "error",
        code: note.error.code,
        detail: note.error.detail
      });
    }
  }, [seen, state.notes, state.issues, t]);
}

/** A failed setup check makes the next start or continue fail. Say so, once, with the way there. */
function SetupBanner() {
  const t = useT();
  const { state, loadHealth } = useDesk();
  const missing = state.health === null;
  useEffect(() => {
    if (missing) loadHealth().catch(() => undefined);
  }, [missing, loadHealth]);
  const failures = state.health?.checks.filter((check) => check.status === "error") ?? [];
  const [first] = failures;
  if (first === undefined) return null;
  return (
    <div className="dk-banner dk-banner-danger dk-mb-250" role="alert">
      <span className="dk-g dk-g-bang" aria-hidden="true" />
      <div className="dk-grow">
        <b>{t("desk.inbox.setup.title")}</b>{" "}
        <span>
          {t("desk.inbox.setup.body", {
            checks: failures.map((check) => check.label).join(", "),
            detail: first.detail
          })}
        </span>
      </div>
      <RouteLink to={{ view: "setup" }} className="dk-linkbtn">
        {t("desk.inbox.setup.open")}
      </RouteLink>
    </div>
  );
}

/** The open PR of each desk issue, by issue number, once the list loaded. */
function usePullsByIssue(active: boolean): ReadonlyMap<number, GithubPull> {
  const { state } = useGithubLists(active);
  return useMemo(() => {
    const pulls = new Map<number, GithubPull>();
    if (state.status !== "ok" || !state.lists.ok) return pulls;
    for (const pull of state.lists.pulls) if (pull.issue !== null) pulls.set(pull.issue, pull);
    return pulls;
  }, [state]);
}

/**
 * The Inbox: what waits on the owner. What stopped, then the decisions at a gate, then the PRs
 * to merge on GitHub, each oldest first. The first row is next up. J and K move between rows;
 * A approves a low-risk plan (any other plan opens), C continues a stopped issue.
 */
export function InboxView() {
  const t = useT();
  const { state } = useDesk();
  const { navigate } = useRouter();
  const newWork = useNewWork();
  const now = useNow();
  const items = useWorkItems();
  const unread = useUnread(items);
  const approvals = useApprovePlans();
  const continueIssue = useContinueIssue();
  const [batchOpen, setBatchOpen] = useState(false);
  const titles = useRef(new Map<string, HTMLAnchorElement>());
  const [cursor, setCursor] = useState<number | null>(null);
  const heading = useId();
  useRefusedStartToasts();

  const groups = useMemo(() => inboxGroups(items), [items]);
  const pulls = usePullsByIssue(groups.github.length > 0);
  const rows = TURN_GROUPS.flatMap((group) => groups[group]);
  const turnCount = rows.length;
  const firstRun = isFirstRun(items);
  // The batch covers every low-risk plan at its gate.
  const batch = groups.decide.filter(
    (item): item is Extract<WorkItem, { kind: "issue" }> =>
      item.kind === "issue" &&
      isLowRiskPlan(item.summary) &&
      !approvals.pending.has(item.summary.issueNumber)
  );

  const target = rows[Math.min(cursor ?? 0, rows.length - 1)];
  const move = (step: 1 | -1): void => {
    if (rows.length === 0) return;
    const next = cursor === null ? 0 : Math.max(0, Math.min(rows.length - 1, cursor + step));
    setCursor(next);
    const item = rows[next];
    if (item !== undefined) titles.current.get(item.key)?.focus();
  };

  useShortcuts([
    { key: "j", run: () => move(1), labelKey: "desk.board.keys.next" },
    { key: "k", run: () => move(-1), labelKey: "desk.board.keys.previous" },
    {
      key: "a",
      labelKey: "desk.board.keys.approve",
      run: () => {
        if (target?.kind !== "issue") return;
        const { summary } = target;
        if (gatePlanRisk(summary) === "low" && !approvals.pending.has(summary.issueNumber)) {
          approvals.approve([summary.issueNumber]);
        } else if (issueStatusOf(summary).gateMode === "plan-gate") {
          navigate({ view: "issue", issueNumber: summary.issueNumber });
        }
      }
    },
    {
      key: "c",
      labelKey: "desk.board.keys.continue",
      run: () => {
        if (target?.kind !== "issue" || !target.summary.readable || target.summary.busy) return;
        if (issueStatusOf(target.summary).primaryAction === "continue") {
          void continueIssue(target.summary.issueNumber);
        }
      }
    }
  ]);
  usePaletteActions([
    {
      id: "inbox-new",
      label: t("desk.newWork.open"),
      hint: keyLabel("n"),
      run: () => newWork.open()
    },
    ...(batch.length > 1
      ? [
          {
            id: "inbox-batch",
            label: t("desk.board.batch.open", { count: batch.length }),
            run: () => setBatchOpen(true)
          }
        ]
      : [])
  ]);

  const summaryLine =
    turnCount === 0
      ? t("desk.inbox.subEmpty", { running: groups.running.length })
      : [
          ...TURN_GROUPS.filter((group) => groups[group].length > 0).map((group) =>
            t(`desk.inbox.sub.${group}`, { count: groups[group].length })
          ),
          t("desk.inbox.sub.running", { count: groups.running.length })
        ].join(" · ");

  let index = 0;
  return (
    <>
      <header className="dk-ph">
        <div className="dk-grow">
          <h1 className="dk-h-page" id={heading}>
            {t("desk.inbox.title")}{" "}
            {turnCount > 0 && <span className="dk-count dk-need dk-num">{turnCount}</span>}
          </h1>
          <p className="dk-lead">{summaryLine}</p>
        </div>
        <Button appearance="outline" onClick={() => newWork.open()}>
          <Plus className="dk-ic" aria-hidden="true" />
          {t("desk.newWork.open")} <Kbd>{keyLabel("n")}</Kbd>
        </Button>
      </header>
      {!firstRun && <SetupBanner />}
      {firstRun && <FirstRunGuide items={items} />}
      {!state.issuesLoaded ? (
        <Loading />
      ) : (
        <div className="dk-inbox">
          <section className="dk-card dk-list" aria-labelledby={heading}>
            {TURN_GROUPS.map((group) => {
              const list = groups[group];
              if (list.length === 0) return null;
              const offset = index;
              index += list.length;
              return (
                <section
                  key={group}
                  className="dk-grp-wrap"
                  aria-labelledby={`${heading}-${group}`}
                >
                  <div className="dk-grp">
                    <h2 id={`${heading}-${group}`}>{t(`desk.inbox.group.${group}`)}</h2>
                    <span className="dk-count dk-num">{list.length}</span>
                    <span className="dk-t-small dk-t-subtlest dk-grow">
                      {t(`desk.inbox.groupNote.${group}`)}
                    </span>
                    {group === "decide" && batch.length > 1 && (
                      <Button
                        appearance="link"
                        spacing="compact"
                        className="dk-bare dk-linkbtn dk-t-small"
                        onClick={() => setBatchOpen(true)}
                      >
                        {t("desk.board.batch.open", { count: batch.length })}
                      </Button>
                    )}
                  </div>
                  <ul className="dk-rows">
                    {list.map((item, at) => (
                      <InboxRow
                        key={item.key}
                        item={item}
                        first={offset + at === 0}
                        unread={unread(item)}
                        pull={
                          item.kind === "issue"
                            ? (pulls.get(item.summary.issueNumber) ?? null)
                            : null
                        }
                        now={now}
                        approving={
                          item.kind === "issue" && approvals.pending.has(item.summary.issueNumber)
                        }
                        onApprove={() => {
                          if (item.kind === "issue") approvals.approve([item.summary.issueNumber]);
                        }}
                        titleRef={(element) => {
                          if (element === null) titles.current.delete(item.key);
                          else titles.current.set(item.key, element);
                        }}
                        onFocusTitle={() => setCursor(offset + at)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {turnCount === 0 && (
              <div className="dk-empty">
                <p className="dk-h-sec">{t("desk.inbox.empty.title")}</p>
                <p>{t("desk.inbox.empty.body")}</p>
              </div>
            )}
          </section>
          <aside className="dk-stack dk-gap-200" aria-label={t("desk.inbox.side")}>
            <RunningPanel items={groups.running} unread={unread} now={now} />
            <FinishedPanel items={groups.finished} now={now} />
          </aside>
        </div>
      )}
      <ApproveBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        plans={batch.map((item) => ({
          issueNumber: item.summary.issueNumber,
          title: titleOf(t, item)
        }))}
        onConfirm={() => approvals.approve(batch.map((item) => item.summary.issueNumber))}
      />
    </>
  );
}
