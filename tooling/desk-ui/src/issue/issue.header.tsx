import type { FlowModel, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import {
  Badge,
  Button,
  Copy,
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
import { useRef, useState } from "react";

import { useTurnQueue } from "./issue.queue";
import { useStageNames } from "../flow/flow.names";
import { FlowStepper } from "../flow/flow.stepper";
import { issueFlowOf, loopsText, shortHash } from "../flow/flow.steps";
import type { IssueActions } from "../gates/gate.actions";
import { CancelDialog, RemoveDialog } from "../gates/gate.confirm";
import { Kbd } from "../gates/gate.frame";
import { useLanguage, useT } from "../i18n/i18n.t";
import { copyText, openExternal } from "../shell/shell.copy";
import { formatElapsed, formatUsd, safeHttpUrl } from "../shell/shell.format";
import { useShortcuts } from "../shell/shell.keys";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink } from "../shell/shell.router";
import { TimeInStage } from "../shell/shell.time";
import { IssueStatusChip } from "../status/status.chip";
import { canCancel, gateModeOf, type ReadableSummary } from "../status/status.model";

/** The graph needs room: a phone gets the stepper only. */
const PHONE_QUERY = "(max-width: 40rem)";
const PR_NUMBER = /\/pull\/(\d+)/;

export interface IssueHeaderProps {
  readonly summary: ReadableSummary;
  /** `undefined` while the detail loads: the stepper and the cost wait for it. */
  readonly detail: IssueDetail | undefined;
  readonly flow: FlowModel | undefined;
  /** The stage open in the side sheet, or `null`. */
  readonly selected: FlowNodeId | null;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly graphOpen: boolean;
  readonly onToggleGraph: () => void;
  readonly actions: IssueActions;
  /** The issue was removed. The page leaves it. */
  readonly onRemoved: () => void;
}

/** Where the issue is in Your turn, and J and K to the previous and the next decision. */
function QueueNav({ issueNumber }: { readonly issueNumber: number }) {
  const t = useT();
  const queue = useTurnQueue(issueNumber);
  useShortcuts([
    { key: "j", run: () => queue.step(1), labelKey: "desk.board.keys.next" },
    { key: "k", run: () => queue.step(-1), labelKey: "desk.board.keys.previous" }
  ]);
  if (queue.total === 0) return null;
  const alone = queue.total === 1 && queue.position !== null;
  return (
    <div className="desk-crumbs__queue">
      <span className="desk-crumbs__where">
        {queue.position === null
          ? t("desk.issue.queue.waiting", { total: queue.total })
          : t("desk.issue.queue.position", { position: queue.position, total: queue.total })}
      </span>
      <Button
        appearance="ghost"
        spacing="compact"
        className="desk-crumbs__prev"
        aria-label={t("desk.issue.queue.previous")}
        aria-keyshortcuts="K"
        disabled={alone}
        onClick={() => queue.step(-1)}
      >
        <Kbd shortcut="k" />
      </Button>
      <Button
        appearance="ghost"
        spacing="compact"
        className="desk-crumbs__next"
        aria-label={t("desk.issue.queue.next")}
        aria-keyshortcuts="J"
        disabled={alone}
        onClick={() => queue.step(1)}
      >
        <span aria-hidden="true">{t("desk.issue.queue.nextShort")}</span>
        <Kbd shortcut="j" />
      </Button>
    </div>
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
        <span className="desk-imeta__item desk-imeta__flow" tabIndex={0}>
          <span className="desk-sr-only">{t("desk.issue.flow.label")} </span>
          <Badge appearance="default">
            {t("desk.issue.flow.badge", { name: summary.flowName, hash })}
          </Badge>
          <span className="desk-muted">{source}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="desk-tooltip">
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
  if (mode === "shipped" || mode === "cancelled") {
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
 * The top of the issue page: the way back and through Your turn, the title with a menu for the
 * rare actions, one line of status, and the stages as a compact stepper.
 */
export function IssueHeader({
  summary,
  detail,
  flow,
  selected,
  onSelect,
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
  const mode = gateModeOf(summary);
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
    <header className="desk-issue-head">
      <div className="desk-crumbs">
        <RouteLink to={{ view: "board" }} className="desk-back">
          {t("desk.issue.back")}
        </RouteLink>
        <QueueNav issueNumber={summary.issueNumber} />
      </div>
      <div className="desk-issue-head__title">
        <h1>
          <span className="desk-issue-number">
            {t("desk.issue.number", { number: summary.issueNumber })}
          </span>{" "}
          {summary.title ?? t("desk.issue.untitled")}
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={moreButton}
              appearance="subtle"
              className="desk-issue-head__more"
              aria-label={t("desk.gate.more")}
            >
              <Ellipsis aria-hidden="true" className="desk-icon" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="desk-menu">
            <DropdownMenuItem
              destructive
              disabled={!canCancel(mode)}
              onSelect={() => setCancelOpen(true)}
            >
              {t("desk.gate.cancel.button")}
            </DropdownMenuItem>
            {!phone && (
              <DropdownMenuItem onSelect={onToggleGraph}>
                {t(graphOpen ? "desk.issue.graph.hide" : "desk.issue.graph.show")}
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
                  <ExternalLink aria-hidden="true" className="desk-icon" />
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setRemoveOpen(true)}>
              {t("desk.gate.remove.button")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="desk-imeta">
        <IssueStatusChip summary={summary} />
        <span className="desk-imeta__item">
          <WaitFact summary={summary} now={now} />
        </span>
        <FlowBadge summary={summary} />
        {cost !== null && (
          <span className="desk-imeta__item">
            {t("desk.issue.meta.cost", { cost: formatUsd(cost, language) })}
          </span>
        )}
        {looped !== null && <span className="desk-imeta__item">{looped}</span>}
        {branch !== null && (
          <span className="desk-imeta__item desk-imeta__branch">
            <span className="desk-sr-only">{t("desk.issue.branch")} </span>
            <code title={branch}>{branch}</code>
            <Button
              appearance="ghost"
              spacing="compact"
              className="desk-imeta__copy"
              aria-label={t("desk.issue.copyBranch")}
              onClick={copyBranch}
            >
              <Copy aria-hidden="true" className="desk-icon" />
            </Button>
          </span>
        )}
        {prUrl !== null && (
          <span className="desk-imeta__item">
            <a href={prUrl} target="_blank" rel="noreferrer noopener">
              {prNumber === null
                ? t("desk.issue.openPr")
                : t("desk.issue.meta.pr", { number: prNumber })}{" "}
              <ExternalLink aria-hidden="true" className="desk-icon" />
            </a>
          </span>
        )}
      </p>
      {flow !== undefined && (
        <FlowStepper
          model={flow}
          selected={selected}
          onSelect={onSelect}
          needsYouReason={summary.needsYouReason}
        />
      )}
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
    </header>
  );
}
