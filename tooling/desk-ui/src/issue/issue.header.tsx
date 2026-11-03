import type { IssueDetail } from "@repo/desk/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Ellipsis,
  ExternalLink,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useMediaQuery
} from "@repo/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef, useState } from "react";

import { useTurnQueue } from "./issue.queue";
import { useStageNames } from "../flow/flow.names";
import { flowStepOf, issueFlowOf, loopsText, shortHash } from "../flow/flow.steps";
import type { IssueActions } from "../gates/gate.actions";
import { CancelDialog, RemoveDialog, TakeOverDialog } from "../gates/gate.confirm";
import { Kbd } from "../gates/gate.frame";
import { RESUMING_OUTPUTS } from "../gates/gate.model";
import { useLanguage, useT } from "../i18n/i18n.t";
import { copyText, openExternal } from "../shell/shell.copy";
import { formatElapsed, formatUsd, safeHttpUrl } from "../shell/shell.format";
import { useShortcuts } from "../shell/shell.keys";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink } from "../shell/shell.router";
import { TimeInStage } from "../shell/shell.time";
import { IssueStatusChip } from "../status/status.chip";
import { canCancel, gateModeOf, hasEnded, type ReadableSummary } from "../status/status.model";
import { issueKey } from "../work/work.model";

/** The graph needs room: a phone gets the stepper only. */
const PHONE_QUERY = "(max-width: 40rem)";
const PR_NUMBER = /\/pull\/(\d+)/;

export interface IssueHeaderProps {
  readonly summary: ReadableSummary;
  /** `undefined` while the detail loads: the stepper and the cost wait for it. */
  readonly detail: IssueDetail | undefined;
  readonly graphOpen: boolean;
  readonly onToggleGraph: () => void;
  readonly actions: IssueActions;
  /** The issue was removed. The page leaves it. */
  readonly onRemoved: () => void;
}

/** Where the item is in the Inbox, and J and K to the previous and the next decision. */
export function QueueNav({ itemKey }: { readonly itemKey: string }) {
  const t = useT();
  const queue = useTurnQueue(itemKey);
  useShortcuts([
    { key: "j", run: () => queue.step(1), labelKey: "desk.board.keys.next" },
    { key: "k", run: () => queue.step(-1), labelKey: "desk.board.keys.previous" }
  ]);
  if (queue.total === 0) return null;
  const alone = queue.total === 1 && queue.position !== null;
  return (
    <span className="dk-qnav">
      <span className="dk-t-sub">
        {queue.position === null
          ? t("desk.issue.queue.waiting", { total: queue.total })
          : t("desk.issue.queue.position", { position: queue.position, total: queue.total })}
      </span>
      <Button
        appearance="ghost"
        spacing="compact"
        className="dk-btn"
        aria-label={t("desk.issue.queue.previous")}
        aria-keyshortcuts="K"
        disabled={alone}
        onClick={() => queue.step(-1)}
      >
        <ArrowLeft aria-hidden="true" className="dk-ic" />
        <Kbd shortcut="k" />
      </Button>
      <Button
        appearance="ghost"
        spacing="compact"
        className="dk-btn"
        aria-label={t("desk.issue.queue.next")}
        aria-keyshortcuts="J"
        disabled={alone}
        onClick={() => queue.step(1)}
      >
        <Kbd shortcut="j" />
        <ArrowRight aria-hidden="true" className="dk-ic" />
      </Button>
    </span>
  );
}

/** The way back to the Inbox, where the item is, and the walk through the decisions. */
export function Crumb({ itemKey, label }: { readonly itemKey: string; readonly label: string }) {
  const t = useT();
  return (
    <nav className="dk-crumb" aria-label={t("desk.item.crumb")}>
      <RouteLink to={{ view: "inbox" }}>{t("desk.item.back")}</RouteLink>
      <span aria-hidden="true" className="dk-slash" />
      <span>{label}</span>
      <span className="dk-grow" />
      <QueueNav itemKey={itemKey} />
    </nav>
  );
}

/**
 * The flow the issue runs on: its name and the short hash of its snapshot, and where the flow
 * file came from. Its steps are one hover or focus away. The name is the owner's, as it is.
 */
function FlowBadge({ summary }: { readonly summary: ReadableSummary }) {
  const t = useT();
  const names = useStageNames();
  const hash = shortHash(summary.flowHash);
  const source = t(`desk.flow.source.${summary.flowSource}`);
  const steps = issueFlowOf(summary)
    .steps.map((step) => names.node(step.id))
    .join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable, so the steps reach a keyboard too. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a tooltip trigger, not a control */}
        <span tabIndex={0}>
          <span className="dk-sr">{t("desk.issue.flow.label")} </span>
          {t("desk.issue.flow.badge", { name: summary.flowName, hash })}
        </span>
      </TooltipTrigger>
      <TooltipContent className="dk-tooltip">
        {t("desk.issue.flow.title", { name: summary.flowName, source, hash, steps })}
      </TooltipContent>
    </Tooltip>
  );
}

/** How long the issue has waited, run, or taken, in the words of its mode. */
function WaitFact({ summary, now }: { readonly summary: ReadableSummary; readonly now: number }) {
  const t = useT();
  const { language } = useLanguage();
  const mode = gateModeOf(summary);
  if (hasEnded(mode)) {
    const took = Date.parse(summary.updatedAt) - Date.parse(summary.createdAt);
    return <span>{t("desk.issue.meta.took", { duration: formatElapsed(took, language) })}</span>;
  }
  if (summary.stageEnteredAt === null) return <TimeInStage summary={summary} now={now} />;
  const duration = formatElapsed(now - Date.parse(summary.stageEnteredAt), language);
  const key =
    mode === "working"
      ? "desk.issue.meta.running"
      : mode === "needs-you"
        ? "desk.issue.meta.stopped"
        : "desk.issue.meta.waiting";
  return <time dateTime={summary.stageEnteredAt}>{t(key, { duration })}</time>;
}

/**
 * The top of the issue page: the way back and through the Inbox, the title with a menu for the
 * rare actions, and one line of status. The steps are in the rail beside the page.
 */
export function IssueHeader({
  summary,
  detail,
  graphOpen,
  onToggleGraph,
  actions,
  onRemoved
}: IssueHeaderProps) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  const phone = useMediaQuery(PHONE_QUERY);
  const moreButton = useRef<HTMLButtonElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const mode = gateModeOf(summary);
  const agent = flowStepOf(issueFlowOf(summary), summary.stage)?.agent ?? null;
  // Only an agent that goes on in its session on the next run can be taken over (ADR 0022).
  const canTakeOver =
    mode === "working" && !summary.paused && agent !== null && RESUMING_OUTPUTS.has(agent.output);
  const issueUrl = safeHttpUrl(summary.url);
  const prUrl = safeHttpUrl(summary.prUrl);
  const prNumber = prUrl === null ? null : (PR_NUMBER.exec(prUrl)?.[1] ?? null);
  const { branch, loops } = summary;
  const looped = Object.values(loops).some((count) => count > 0)
    ? loopsText(t, issueFlowOf(summary), loops, "desk.issue.loopsValue")
    : null;
  const costs = (detail?.runs ?? []).flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]));
  const cost = costs.length === 0 ? null : costs.reduce((sum, value) => sum + value, 0);

  const copyBranch = (): void => {
    if (branch !== null) {
      copyText(branch, t("desk.issue.branchCopied"), t("desk.issue.copyFailed"));
    }
  };

  usePaletteActions([
    ...(branch === null
      ? []
      : [{ id: "issue-copy-branch", label: t("desk.issue.copyBranch"), run: copyBranch }]),
    ...(issueUrl === null
      ? []
      : [
          {
            id: "issue-github",
            label: t("desk.issue.openOnGithub"),
            run: () => openExternal(issueUrl)
          }
        ])
  ]);

  /** A dialog opened from the menu returns focus to the menu button. */
  const backToMenu = (event: Event): void => {
    if (moreButton.current === null) return;
    event.preventDefault();
    moreButton.current.focus();
  };

  return (
    <>
      <Crumb
        itemKey={issueKey(summary.issueNumber)}
        label={t("desk.issue.number", { number: summary.issueNumber })}
      />
      <header className="dk-ihead">
        <div className="dk-grow">
          <h1>
            <span className="dk-idn">
              {t("desk.issue.number", { number: summary.issueNumber })}
            </span>{" "}
            {summary.title ?? t("desk.issue.untitled")}
          </h1>
          <p className="dk-meta">
            <IssueStatusChip summary={summary} />
            <span>
              <WaitFact summary={summary} now={now} />
            </span>
            <FlowBadge summary={summary} />
            {cost !== null && (
              <span>{t("desk.issue.meta.cost", { cost: formatUsd(cost, language) })}</span>
            )}
            {looped !== null && <span>{looped}</span>}
            {branch !== null && (
              <span className="dk-ihead-more">
                <span className="dk-sr">{t("desk.issue.branch")} </span>
                <code className="dk-mono" title={branch}>
                  {branch}
                </code>
              </span>
            )}
            {prUrl !== null && (
              <span>
                <a href={prUrl} target="_blank" rel="noreferrer noopener">
                  {prNumber === null
                    ? t("desk.issue.openPr")
                    : t("desk.issue.meta.pr", { number: prNumber })}{" "}
                  <ExternalLink aria-hidden="true" className="dk-ic" />
                </a>
              </span>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={moreButton}
              appearance="outline"
              spacing="icon"
              aria-label={t("desk.gate.more")}
            >
              <Ellipsis aria-hidden="true" className="dk-ic" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!phone && (
              <DropdownMenuItem onSelect={onToggleGraph}>
                {t(graphOpen ? "desk.issue.graph.hide" : "desk.issue.graph.show")}
              </DropdownMenuItem>
            )}
            {canTakeOver && (
              <DropdownMenuItem onSelect={() => setTakeOverOpen(true)}>
                {t("desk.gate.working.takeOver")}
              </DropdownMenuItem>
            )}
            {branch !== null && (
              <DropdownMenuItem onSelect={copyBranch}>
                {t("desk.issue.copyBranch")}
              </DropdownMenuItem>
            )}
            {issueUrl !== null && (
              <DropdownMenuItem asChild>
                <a href={issueUrl} target="_blank" rel="noreferrer noopener">
                  {t("desk.issue.openOnGithub")}
                  <ExternalLink aria-hidden="true" className="dk-ic" />
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              disabled={!canCancel(mode)}
              onSelect={() => setCancelOpen(true)}
            >
              {t("desk.gate.cancel.button")}
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setRemoveOpen(true)}>
              {t("desk.gate.remove.button")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <TakeOverDialog
        issueNumber={summary.issueNumber}
        open={takeOverOpen}
        onOpenChange={setTakeOverOpen}
        onCloseAutoFocus={backToMenu}
        onConfirm={() => void actions.run({ action: "take-over" })}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCloseAutoFocus={backToMenu}
        onConfirm={() => void actions.run({ action: "cancel" })}
      />
      <RemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onCloseAutoFocus={backToMenu}
        onConfirm={(force) => {
          void actions.run({ action: "remove", force }).then((settled) => {
            if (settled.kind === "done") onRemoved();
          });
        }}
      />
    </>
  );
}
