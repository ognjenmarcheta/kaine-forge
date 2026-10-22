import type { IssueSummary, NodeStatus, StageId } from "@repo/desk/contracts";

import { issueFlowOf, stepRoleOf, type IssueFlow } from "../flow/flow.steps";

/**
 * One place that turns engine codes into what the page shows: the board column, the color
 * role, the words of the status chip, the gate controls, and the next action. Every view
 * reads it, so a card, the issue header, and the gate panel cannot disagree.
 */

// --- tones ------------------------------------------------------------------

/**
 * The design-system role of a status. The stylesheet maps each tone to `--ds-*` tokens
 * (`.desk-tone--<tone>`), so a theme change needs no code. `warning-subtle` is a warning in a
 * quiet tint: the work went back and ran again.
 */
export type Tone = "information" | "warning" | "success" | "warning-subtle" | "danger" | "neutral";

export const toneClass = (tone: Tone): string => `desk-tone--${tone}`;

/** The `appearance` of a `@repo/ui` Badge or Tag for a tone. */
export type Appearance = "default" | "success" | "warning" | "danger" | "information";

const APPEARANCE_OF_TONE: Readonly<Record<Tone, Appearance>> = {
  information: "information",
  warning: "warning",
  "warning-subtle": "warning",
  success: "success",
  danger: "danger",
  neutral: "default"
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
  switch (stepRoleOf(issueFlowOf(summary), summary.stage)) {
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

export const BOARD_GROUPS = ["needs-you", "waiting", "running", "done"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

/** The owner's turn: an issue that stopped and needs them, or one that waits at a gate. */
export const isYourTurn = (group: BoardGroup): boolean =>
  group === "needs-you" || group === "waiting";

/** The state half of a chip such as "Build · running". */
export const CHIP_STATES = [
  "waiting-for-you",
  "working",
  "running",
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
  readonly group: BoardGroup;
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
      group: "needs-you",
      tone: "danger",
      label: byKey("desk.chip.unreadable"),
      gateMode: null,
      primaryAction: "open"
    };
  }
  const gateMode = gateModeOf(summary);
  const status = (
    group: BoardGroup,
    tone: Tone,
    label: StatusLabel,
    primaryAction: PrimaryAction
  ): IssueStatus => ({ group, tone, label, gateMode, primaryAction });

  if (gateMode === "needs-you") {
    // Intake cannot continue: it reads the issue again, so it needs a new start and its options.
    const action = summary.resumeStage === "intake" ? "restart" : "continue";
    return status("needs-you", "danger", byKey("desk.stage.needs-you"), action);
  }
  if (gateMode === "shipped") {
    const action = summary.prUrl === null ? "open" : "open-pr";
    return status("done", "success", byKey("desk.stage.shipped"), action);
  }
  if (gateMode === "cancelled") {
    return status("done", "neutral", byKey("desk.stage.cancelled"), "open");
  }
  if (gateMode === "finished") {
    return status("done", "success", byKey("desk.stage.finished"), "open");
  }
  if (summary.status === "failed") {
    return status("needs-you", "danger", inStage(summary, "failed"), "open");
  }
  if (gateMode === "working") {
    const state = summary.busy ? "working" : summary.status;
    return status("running", "information", inStage(summary, state), "working");
  }
  if (gateMode === "plan-gate") {
    return status("waiting", "warning", inStage(summary, "waiting-for-you"), "review-plan");
  }
  if (gateMode === "pr-review") {
    return status("waiting", "warning", inStage(summary, "waiting-for-you"), "review-ship");
  }
  if (gateMode === "gate") {
    return status("waiting", "warning", inStage(summary, "waiting-for-you"), "open");
  }
  if (gateMode === "pr-open") {
    const action = summary.prUrl === null ? "open" : "open-pr";
    return status("waiting", "warning", inStage(summary, "waiting-for-you"), action);
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
