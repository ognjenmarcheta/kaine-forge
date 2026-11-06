import type { IssueSummary, NeedsYouCode, NodeStatus, StageId } from "@repo/desk/contracts";

import { flowStepOf, issueFlowOf, type IssueFlow } from "../flow/flow.steps";

/**
 * One place that turns engine codes into what the page shows: the board column, the color
 * role, the words of the status chip, the gate controls, and the next action. Every view
 * reads it, so a card, the issue header, and the gate panel cannot disagree.
 */

// --- tones ------------------------------------------------------------------

/**
 * The design-system role of a status. The stylesheet maps each tone to `--ds-*` tokens
 * (`.desk-tone--<tone>`), so a theme change needs no code. `warning-subtle` is a warning in a
 * quiet tint: the work went back and ran again. `attention` is "your turn": it has its own
 * role, so a theme can tell it apart from a real warning.
 */
export type Tone =
  "information" | "warning" | "success" | "warning-subtle" | "danger" | "neutral" | "attention";

/** The glyph beside a status's words, so color is never the only signal. */
export const TONE_GLYPH: Readonly<Record<Tone, string>> = {
  success: "✓",
  attention: "◷",
  warning: "▲",
  "warning-subtle": "↺",
  danger: "!",
  information: "↻",
  neutral: "–"
};

export const toneClass = (tone: Tone): string => `desk-tone--${tone}`;

/** The `appearance` of a `@repo/ui` Badge or Tag for a tone. */
export type Appearance = "default" | "success" | "warning" | "danger" | "information";

const APPEARANCE_OF_TONE: Readonly<Record<Tone, Appearance>> = {
  information: "information",
  warning: "warning",
  "warning-subtle": "warning",
  success: "success",
  danger: "danger",
  neutral: "default",
  attention: "warning"
};

export const appearanceOf = (tone: Tone): Appearance => APPEARANCE_OF_TONE[tone];

export const NODE_TONE: Readonly<Record<NodeStatus, Tone>> = {
  idle: "neutral",
  running: "information",
  waiting: "warning",
  passed: "success",
  looped: "warning-subtle",
  failed: "danger"
};

/** Translation key of a node status (shown as text beside its color). */
export const nodeStatusKey = (status: NodeStatus): string => `desk.flow.status.${status}`;

/** A yes or no result: a passed check, an approved review. */
export const passTone = (passed: boolean): Tone => (passed ? "success" : "danger");

export const HEALTH_TONE = {
  ok: "success",
  warn: "warning",
  error: "danger"
} as const satisfies Readonly<Record<string, Tone>>;

export const CLAIMED_CHECK_TONE = {
  pass: "success",
  fail: "danger",
  "not-run": "neutral"
} as const satisfies Readonly<Record<string, Tone>>;

export const SEVERITY_TONE = {
  Critical: "danger",
  Consider: "warning",
  Nit: "neutral",
  FYI: "information"
} as const satisfies Readonly<Record<string, Tone>>;

// --- gate mode --------------------------------------------------------------

/**
 * What the engineer can do about an issue now. It follows the step kind of the stage in the
 * issue's own flow, never a guess: `plan-gate` approves a plan, `pr-review` reviews the change
 * and ships, `gate` approves or sends back, and `pr-open` waits on the draft PR.
 */
export type GateMode =
  | "plan-gate"
  | "pr-review"
  | "gate"
  | "pr-open"
  | "needs-you"
  | "working"
  | "shipped"
  | "cancelled"
  | "finished"
  | "idle";

export type ReadableSummary = Extract<IssueSummary, { readonly readable: true }>;

export function gateModeOf(summary: ReadableSummary): GateMode {
  if (summary.stage === "shipped") return "shipped";
  if (summary.stage === "cancelled") return "cancelled";
  if (summary.stage === "finished") return "finished";
  if (summary.stage === "needs-you") return "needs-you";
  if (summary.busy || summary.status === "running" || summary.status === "queued") {
    return "working";
  }
  switch (flowStepOf(issueFlowOf(summary), summary.stage)?.role) {
    case "plan-gate":
      return "plan-gate";
    case "ship-gate":
      return "pr-review";
    case "gate":
      return "gate";
    case "pr-wait":
      return "pr-open";
    default:
      return "idle";
  }
}

/** The issue ended: shipped, cancelled, or every step of a flow without a ship ran. */
export const hasEnded = (mode: GateMode): boolean =>
  mode === "shipped" || mode === "cancelled" || mode === "finished";

/** A finished run has nothing to cancel. */
export const canCancel = (mode: GateMode): boolean => !hasEnded(mode);

// --- reason excerpt ---------------------------------------------------------

const firstSentence = (line: string): string => line.split(/(?<=[.!?])\s+/)[0] ?? line;

/**
 * The first meaningful sentence of an engine reason, for a card or a chip. A line that ends
 * on a colon introduces what follows, so it joins the next non-empty line: "Two checks
 * failed the same way: FAIL board.test.tsx", never a dangling "…the same way:".
 */
export function reasonExcerpt(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const [first, next] = lines;
  if (first === undefined) return "";
  const sentence = firstSentence(first);
  if (!sentence.endsWith(":") || next === undefined) return sentence;
  return `${sentence} ${firstSentence(next)}`;
}

// --- issue status -----------------------------------------------------------

/**
 * Where work sits. The Inbox shows the first three, in this order: what stopped, the decisions
 * at a gate, and the PRs to merge on GitHub. Running and Finished are side panels.
 */
export const INBOX_GROUPS = ["stopped", "decide", "github", "running", "finished"] as const;
export type InboxGroup = (typeof INBOX_GROUPS)[number];

/** The owner's turn: work that stopped, waits at a gate, or waits for a merge on GitHub. */
export const isYourTurn = (group: InboxGroup): boolean =>
  group === "stopped" || group === "decide" || group === "github";

/** The state half of a chip such as "Build · running". */
export const CHIP_STATES = [
  "your-turn",
  "working",
  "running",
  "paused",
  "queued",
  "idle",
  "waiting",
  "done",
  "failed"
] as const;
export type ChipState = (typeof CHIP_STATES)[number];

/**
 * The words of the chip: one key, or a stage with its state ("Plan approval · waiting for you").
 * `flow` names the stage.
 */
export type StatusLabel =
  | { readonly kind: "key"; readonly key: string }
  /** "Stopped · same failure twice", "Stopped · issue format 0/6": the reason from its code. */
  | {
      readonly kind: "stopped";
      readonly code: NeedsYouCode | null;
      readonly contract: { readonly found: number; readonly total: number } | null;
    }
  | {
      readonly kind: "stage";
      readonly stage: StageId;
      readonly state: ChipState;
      readonly flow: IssueFlow;
    };

/** The one next step a card offers. Navigation actions open the issue page. */
export type PrimaryAction =
  "continue" | "restart" | "review-plan" | "review-ship" | "open-pr" | "working" | "open";

export interface IssueStatus {
  readonly group: InboxGroup;
  readonly tone: Tone;
  readonly label: StatusLabel;
  /** `null` for an unreadable issue: it has no stage to act on. */
  readonly gateMode: GateMode | null;
  readonly primaryAction: PrimaryAction;
}

const inStage = (summary: ReadableSummary, state: ChipState): StatusLabel => ({
  kind: "stage",
  stage: summary.stage,
  state,
  flow: issueFlowOf(summary)
});
const byKey = (key: string): StatusLabel => ({ kind: "key", key });

/**
 * Where an issue sits and what it shows. An unreadable issue and a stopped or failed one
 * need the engineer first. A gate waits for the engineer. A shipped, cancelled or finished
 * issue is done. Anything the engine drives, including a gate whose action still runs, is running.
 */
export function issueStatusOf(summary: IssueSummary): IssueStatus {
  if (!summary.readable) {
    return {
      group: "stopped",
      tone: "danger",
      label: byKey("desk.chip.unreadable"),
      gateMode: null,
      primaryAction: "open"
    };
  }
  const gateMode = gateModeOf(summary);
  const status = (
    group: InboxGroup,
    tone: Tone,
    label: StatusLabel,
    primaryAction: PrimaryAction
  ): IssueStatus => ({ group, tone, label, gateMode, primaryAction });

  if (gateMode === "needs-you") {
    // Intake cannot continue: it reads the issue again, so it needs a new start and its options.
    const action = summary.resumeStage === "intake" ? "restart" : "continue";
    const code = summary.needsYouCode ?? (summary.resumeStage === "intake" ? "intake" : null);
    return status(
      "stopped",
      "danger",
      { kind: "stopped", code, contract: code === "intake" ? summary.contract : null },
      action
    );
  }
  if (gateMode === "shipped") {
    const action = summary.prUrl === null ? "open" : "open-pr";
    return status("finished", "success", byKey("desk.stage.shipped"), action);
  }
  if (gateMode === "cancelled") {
    return status("finished", "neutral", byKey("desk.stage.cancelled"), "open");
  }
  if (gateMode === "finished") {
    return status("finished", "success", byKey("desk.stage.finished"), "open");
  }
  if (summary.status === "failed") {
    return status("stopped", "danger", inStage(summary, "failed"), "open");
  }
  if (gateMode === "working") {
    const state = summary.busy ? "running" : summary.paused ? "paused" : summary.status;
    return status("running", "information", inStage(summary, state), "working");
  }
  if (gateMode === "plan-gate") {
    return status("decide", "attention", inStage(summary, "your-turn"), "review-plan");
  }
  if (gateMode === "pr-review") {
    return status("decide", "attention", inStage(summary, "your-turn"), "review-ship");
  }
  if (gateMode === "gate") {
    return status("decide", "attention", inStage(summary, "your-turn"), "open");
  }
  if (gateMode === "pr-open") {
    const action = summary.prUrl === null ? "open" : "open-pr";
    return status("github", "attention", inStage(summary, "your-turn"), action);
  }
  return status("running", "neutral", inStage(summary, summary.status), "open");
}

// --- plan risk --------------------------------------------------------------

export type PlanRisk = NonNullable<ReadableSummary["planRisk"]>;

export const PLAN_RISK_TONE: Readonly<Record<PlanRisk, Tone>> = {
  low: "success",
  medium: "warning",
  high: "danger"
};

export const PLAN_RISK_KEY: Readonly<Record<PlanRisk, string>> = {
  low: "desk.risk.low",
  medium: "desk.risk.medium",
  high: "desk.risk.high"
};

/** The risk of the plan that waits for approval now; `null` away from the plan gate. */
export const gatePlanRisk = (summary: IssueSummary): PlanRisk | null =>
  summary.readable && gateModeOf(summary) === "plan-gate" ? summary.planRisk : null;

/** A plan at its gate that the planner graded low risk: the board can approve it directly. */
export const isLowRiskPlan = (summary: IssueSummary): boolean => gatePlanRisk(summary) === "low";

/** Why a gate waits for the owner, in one line. A stopped issue shows the engine's reason instead. */
export const GATE_REASON_KEY: Readonly<Partial<Record<GateMode, string>>> = {
  "plan-gate": "desk.board.reason.plan-gate",
  "pr-review": "desk.board.reason.pr-review",
  gate: "desk.board.reason.gate",
  "pr-open": "desk.board.reason.pr-open"
};
