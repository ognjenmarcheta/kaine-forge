import { ACTIVE_STAGES, type FeedbackTarget, type IssueDetail } from "@repo/desk/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Ellipsis,
  ExternalLink,
  GitPullRequest,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  buttonVariants,
  useMediaQuery
} from "@repo/ui";
import { useId, useRef, useState, type ReactElement, type RefObject } from "react";

import type { IssueActions } from "./gate.actions";
import { CancelDialog, RemoveDialog } from "./gate.confirm";
import { FeedbackForm } from "./gate.feedback";
import { ShipDialog } from "./gate.ship-dialog";
import { useT } from "../i18n/i18n.t";
import { safeHttpUrl } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { TimeInStage } from "../shell/shell.time";
import { Pre } from "../shell/shell.ui";
import { canCancel, gateModeOf, type GateMode, type ReadableSummary } from "../status/status.model";

const PR_REVIEW_TARGETS: readonly FeedbackTarget[] = ["build", "review", "plan"];
const PLAN_TARGETS: readonly FeedbackTarget[] = ["plan"];
const AUTO_STAGE = "auto";
const PR_LINK = buttonVariants({ appearance: "default" });
/** The modes where the issue waits for the engineer's decision. */
const DECIDE: ReadonlySet<GateMode> = new Set<GateMode>(["plan-gate", "pr-review", "needs-you"]);
/** The complements of the stylesheet's `min-width` rules: the layout is exact at 64 and 40 rem. */
const COMPACT_QUERY = "not all and (min-width: 64rem)";
const NARROW_QUERY = "not all and (min-width: 40rem)";

/**
 * Where the decision sits. `side`: pinned at the bottom of the inspector, with its actions
 * (64 rem and wider). `bar`: in the page flow, with only the actions in a bar that sticks to
 * the bottom of the screen. `bar-narrow`: the same, and the secondary action moves into the
 * More menu (below 40 rem), so the bar keeps one row.
 */
export type GateLayout = "side" | "bar" | "bar-narrow";

/** The layout for the screen width. Before the first measure it is `side`, the desktop layout. */
export function useGateLayout(): GateLayout {
  const compact = useMediaQuery(COMPACT_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  if (!compact) return "side";
  return narrow ? "bar-narrow" : "bar";
}

export interface GatePanelProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  readonly actions: IssueActions;
  /** The issue was removed. The page leaves it. */
  readonly onRemoved: () => void;
  readonly layout: GateLayout;
}

export interface GateParts {
  /** The title, the explanation, and what the decision needs. In the `side` layout, with its actions too. */
  readonly decision: ReactElement;
  /** Where the inspector puts the decision: pinned below its body, first above the stage tiles, or last in its body. */
  readonly placement: "pinned" | "first" | "last";
  /** The compact bar with the actions, or `null` in the `side` layout and when there is no primary action. */
  readonly bar: ReactElement | null;
}

/** Cancel and Remove, out of the way in a menu. Both ask first, and focus comes back to the menu button. */
function MoreMenu({
  mode,
  trigger,
  busy,
  onRequestChanges,
  onCloseAutoFocus,
  onCancel,
  onRemove
}: {
  readonly mode: GateMode;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly busy: boolean;
  /** Set when the secondary action has no room in the bar: it moves into the menu. */
  readonly onRequestChanges: (() => void) | null;
  readonly onCloseAutoFocus: (event: Event) => void;
  readonly onCancel: () => void;
  readonly onRemove: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          appearance="subtle"
          className="desk-gate__more"
          aria-label={t("desk.gate.more")}
        >
          <Ellipsis aria-hidden="true" className="desk-icon" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="desk-menu" onCloseAutoFocus={onCloseAutoFocus}>
        {onRequestChanges !== null && (
          <>
            <DropdownMenuItem disabled={busy} onSelect={onRequestChanges}>
              {t("desk.gate.requestChanges")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {canCancel(mode) && (
          <DropdownMenuItem destructive onSelect={onCancel}>
            {t("desk.gate.cancel.button")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem destructive onSelect={onRemove}>
          {t("desk.gate.remove.button")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The decision for the issue's stage: one primary action, a secondary one, and a menu for
 * Cancel and Remove. Anything that starts work is disabled while an action runs. Cancel and
 * Remove stay enabled, because they stop it.
 *
 * On a desktop the whole decision is pinned at the bottom of the inspector. Below 64 rem only
 * the actions stick to the bottom of the screen, and the rest is in the page flow: above the
 * stage tiles while the issue waits for the engineer, so the reason and the choice are visible.
 */
export function useGatePanel({
  detail,
  summary,
  actions,
  onRemoved,
  layout
}: GatePanelProps): GateParts {
  const t = useT();
  const id = useId();
  const now = useNow();
  const mode: GateMode = gateModeOf(summary);
  const heading = useRef<HTMLHeadingElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  /** The feedback form was opened from the menu: focus goes to its box, not back to the menu. */
  const feedbackFromMenu = useRef(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [resume, setResume] = useState<string>(AUTO_STAGE);
  const prUrl = safeHttpUrl(detail.state.prUrl);
  const titleId = `${id}-title`;
  const feedbackId = `${id}-feedback`;
  const decides = DECIDE.has(mode);
  const hasPrimary = decides || (mode === "shipped" && prUrl !== null);
  const withBar = layout !== "side" && hasPrimary;
  const hasSecondary = mode === "plan-gate" || mode === "pr-review";
  const secondaryInMenu = hasSecondary && withBar && layout === "bar-narrow";

  /** Run an action, and move focus to the heading when it worked: the pressed button may be gone. */
  const send = async (request: Parameters<IssueActions["run"]>[0]): Promise<boolean> => {
    const settled = await actions.run(request);
    const worked = settled.kind === "done";
    if (worked) heading.current?.focus();
    return worked;
  };

  /** A dialog opened from the menu returns focus to the menu button. */
  const backToMenu = (event: Event): void => {
    if (moreButton.current === null) return;
    event.preventDefault();
    moreButton.current.focus();
  };

  /** The menu returns focus to its button, unless it opened the feedback form: then the box takes it. */
  const afterMenu = (event: Event): void => {
    if (!feedbackFromMenu.current) return;
    feedbackFromMenu.current = false;
    event.preventDefault();
    document.getElementById(feedbackId)?.querySelector("textarea")?.focus();
  };

  const requestChanges = (targets: readonly FeedbackTarget[]) =>
    feedbackOpen ? (
      <FeedbackForm
        id={feedbackId}
        targets={targets}
        busy={actions.busy}
        onCancel={() => setFeedbackOpen(false)}
        onSend={async (to, text) => {
          const sent = await send({ action: "feedback", to, text });
          if (sent) setFeedbackOpen(false);
          return sent;
        }}
      />
    ) : null;

  const secondaryChanges = hasSecondary && !secondaryInMenu && (
    <Button
      appearance="secondary"
      disabled={actions.busy}
      aria-expanded={feedbackOpen}
      aria-controls={feedbackOpen ? feedbackId : undefined}
      onClick={() => setFeedbackOpen((open) => !open)}
    >
      {t("desk.gate.requestChanges")}
    </Button>
  );

  const moreMenu = (
    <MoreMenu
      mode={mode}
      trigger={moreButton}
      busy={actions.busy}
      onRequestChanges={
        secondaryInMenu
          ? () => {
              feedbackFromMenu.current = true;
              setFeedbackOpen(true);
            }
          : null
      }
      onCloseAutoFocus={afterMenu}
      onCancel={() => setCancelOpen(true)}
      onRemove={() => setRemoveOpen(true)}
    />
  );

  const primary = (() => {
    switch (mode) {
      case "plan-gate":
        return (
          <Button
            className="desk-gate__primary"
            disabled={actions.busy}
            onClick={() => void send({ action: "approve" })}
          >
            {t("desk.gate.plan.approve")}
          </Button>
        );
      case "pr-review":
        return (
          <Button
            className="desk-gate__primary"
            disabled={actions.busy}
            onClick={() => setShipOpen(true)}
          >
            {t("desk.gate.pr.ship")}
          </Button>
        );
      case "needs-you":
        return (
          <Button
            className="desk-gate__primary"
            disabled={actions.busy}
            onClick={() => {
              const from = ACTIVE_STAGES.find((stage) => stage === resume);
              void send(from === undefined ? { action: "continue" } : { action: "continue", from });
            }}
          >
            {t("desk.gate.needsYou.continue")}
          </Button>
        );
      case "shipped":
        return prUrl === null ? null : (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={`${PR_LINK} desk-gate__primary`}
          >
            <GitPullRequest aria-hidden="true" className="desk-icon" />
            {t("desk.gate.shipped.openPr")}
            <ExternalLink aria-hidden="true" className="desk-icon" />
          </a>
        );
      default:
        return null;
    }
  })();

  const decision = (
    <section className="desk-gate" data-mode={mode} aria-labelledby={titleId}>
      <div className="desk-gate__head">
        <h3 ref={heading} tabIndex={-1} id={titleId} className="desk-gate__title">
          {t(`desk.gate.title.${mode}`)}
        </h3>
        {!withBar && moreMenu}
      </div>
      <p className="desk-muted desk-gate__intro">{t(`desk.gate.intro.${mode}`)}</p>

      {mode === "needs-you" && (
        <>
          {summary.needsYouReason !== null && (
            <Pre label={t("desk.gate.needsYou.reason")}>{summary.needsYouReason}</Pre>
          )}
          <div className="desk-field">
            <Label htmlFor={`${id}-resume`}>{t("desk.gate.needsYou.resume")}</Label>
            <Select value={resume} onValueChange={setResume}>
              <SelectTrigger id={`${id}-resume`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_STAGE}>
                  {summary.resumeStage === null
                    ? t("desk.gate.needsYou.resumeAuto")
                    : t("desk.gate.needsYou.resumeRemembered", {
                        stage: t(`desk.stage.${summary.resumeStage}`)
                      })}
                </SelectItem>
                {ACTIVE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {t(`desk.stage.${stage}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {mode === "working" && (
        <p className="desk-loading desk-gate__working" role="status">
          <Spinner size="sm" label={t("desk.common.loading")} aria-hidden="true" />
          <span>{t("desk.gate.working.label", { stage: t(`desk.stage.${summary.stage}`) })}</span>
          <span className="desk-muted desk-gate__elapsed">
            <TimeInStage summary={summary} now={now} />
          </span>
        </p>
      )}

      {mode === "shipped" && <p className="desk-note">{t("desk.gate.shipped.youMerge")}</p>}

      {mode === "plan-gate" && requestChanges(PLAN_TARGETS)}
      {mode === "pr-review" && requestChanges(PR_REVIEW_TARGETS)}

      {layout === "side" && (
        <div className="desk-gate__row">
          {primary}
          {secondaryChanges}
        </div>
      )}

      <ShipDialog
        issueNumber={summary.issueNumber}
        open={shipOpen}
        onOpenChange={setShipOpen}
        actions={actions}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onCloseAutoFocus={backToMenu}
        onConfirm={() => void send({ action: "cancel" })}
      />
      <RemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onCloseAutoFocus={backToMenu}
        onConfirm={(force) => {
          void send({ action: "remove", force }).then((removed) => {
            if (removed) onRemoved();
          });
        }}
      />
    </section>
  );

  return {
    decision,
    placement: layout === "side" ? "pinned" : decides ? "first" : "last",
    bar: withBar ? (
      <div className="desk-gate-bar" role="group" aria-labelledby={titleId}>
        {primary}
        {secondaryChanges}
        {moreMenu}
      </div>
    ) : null
  };
}
