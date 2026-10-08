import {
  FLOW_NODE_IDS,
  type BuilderOutput,
  type CheckSummary,
  type ContractProgress,
  type FlowModel,
  type FlowNode,
  type FlowNodeId,
  type HistoryEvent,
  type IssueDetail,
  type LogEntry,
  type PlannerOutput,
  type ReviewArtifactView,
  type ShipReadiness
} from "@repo/desk/contracts";

import type { ArtifactState } from "../artifacts/artifact.use";
import type { TranslationValues } from "../i18n/i18n.t";
import { reasonExcerpt, type Tone } from "../status/status.model";

/**
 * What the inspector shows for one stage, from the issue detail and the stage's artifact.
 * Pure: it returns codes, numbers, and engine text. The components own the words.
 */

// --- selection --------------------------------------------------------------

/** The stage the inspector shows: the one the engineer picked, else the current one. */
export const resolveSelection = (picked: FlowNodeId | null, model: FlowModel): FlowNodeId =>
  picked ?? model.current ?? FLOW_NODE_IDS[0];

// --- text -------------------------------------------------------------------

/** A translation key with its values, or engine text shown as it is. */
export type ItemText =
  | { readonly kind: "key"; readonly key: string; readonly values?: TranslationValues }
  | { readonly kind: "raw"; readonly text: string };

const key = (name: string, values?: TranslationValues): ItemText =>
  values === undefined ? { kind: "key", key: name } : { kind: "key", key: name, values };
const raw = (text: string): ItemText => ({ kind: "raw", text });

// --- KPI tiles --------------------------------------------------------------

export type KpiValue =
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "ratio"; readonly value: number; readonly total: number }
  | { readonly kind: "duration"; readonly ms: number }
  | { readonly kind: "findings"; readonly total: number; readonly blocking: number }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "none" }
  | { readonly kind: "loading" };

export interface Kpi {
  readonly id: string;
  /** Translation key of the label. */
  readonly label: string;
  readonly value: KpiValue;
  readonly tone: Tone;
}

/** Loop-backs that left a stage, and those that came back into it. */
export function loopsOf(id: FlowNodeId, model: FlowModel): { from: number; to: number } {
  let from = 0;
  let to = 0;
  for (const edge of model.edges) {
    if (!edge.dashed) continue;
    const total = edge.count + edge.feedbackCount;
    if (edge.from === id) from += total;
    if (edge.to === id) to += total;
  }
  return { from, to };
}

/** Stages that work receives back (a re-plan, a rebuild), rather than sends back. */
const RECEIVES_LOOPS: ReadonlySet<FlowNodeId> = new Set(["plan", "build"]);

const countOf = <T>(state: ArtifactState<T>, pick: (value: T) => number): KpiValue => {
  switch (state.status) {
    case "loading":
      return { kind: "loading" };
    case "ok":
      return { kind: "count", value: pick(state.value) };
    default:
      return { kind: "none" };
  }
};

/** Artifacts a stage tile may read. A missing entry means the stage does not use it. */
export interface StageArtifacts {
  readonly plan?: ArtifactState<PlannerOutput>;
  readonly build?: ArtifactState<BuilderOutput>;
}

const READINESS_KEYS = [
  "checkPassed",
  "reviewApproved",
  "reviewedDiffMatches",
  "currentDiffMatches"
] as const;

function stageKpi(node: FlowNode, detail: IssueDetail, artifacts: StageArtifacts): Kpi {
  const tile = (id: string, label: string, value: KpiValue, tone: Tone = "neutral"): Kpi => ({
    id,
    label,
    value,
    tone
  });
  switch (node.id) {
    case "ticket": {
      const contract = detail.contract;
      return contract === null
        ? tile("contract", "desk.inspector.kpi.contract", { kind: "none" })
        : tile(
            "contract",
            "desk.inspector.kpi.contract",
            { kind: "ratio", value: contract.found, total: contract.total },
            contract.found === contract.total ? "success" : "warning"
          );
    }
    case "plan":
    case "plan-gate":
      return tile(
        "files",
        "desk.inspector.kpi.planFiles",
        artifacts.plan === undefined
          ? { kind: "none" }
          : countOf(artifacts.plan, (plan) => plan.files.length)
      );
    case "build":
      return tile(
        "files",
        "desk.inspector.kpi.filesChanged",
        artifacts.build === undefined
          ? { kind: "none" }
          : countOf(artifacts.build, (build) => build.filesChanged.length)
      );
    case "check": {
      const check = detail.check;
      if (check === null) return tile("steps", "desk.inspector.kpi.steps", { kind: "none" });
      const passed = check.steps.filter(stepPassed).length;
      return tile(
        "steps",
        "desk.inspector.kpi.steps",
        { kind: "ratio", value: passed, total: check.steps.length },
        check.passed ? "success" : "danger"
      );
    }
    case "review": {
      const review = detail.review;
      return review === null
        ? tile("findings", "desk.inspector.kpi.findings", { kind: "none" })
        : tile(
            "findings",
            "desk.inspector.kpi.findings",
            { kind: "findings", total: review.findings.length, blocking: review.blocking },
            review.blocking > 0 ? "danger" : "neutral"
          );
    }
    case "pr-review": {
      const ready = READINESS_KEYS.filter((name) => detail.ship[name] === true).length;
      return tile(
        "ready",
        "desk.inspector.kpi.ready",
        { kind: "ratio", value: ready, total: READINESS_KEYS.length },
        ready === READINESS_KEYS.length ? "success" : "warning"
      );
    }
    case "ship": {
      const { prNumber, commitSha } = detail.state;
      if (prNumber !== null && prNumber !== undefined) {
        return tile("pr", "desk.inspector.kpi.pullRequest", {
          kind: "text",
          text: `#${String(prNumber)}`
        });
      }
      return tile(
        "commit",
        "desk.inspector.kpi.commit",
        commitSha === null || commitSha === undefined
          ? { kind: "none" }
          : { kind: "text", text: commitSha.slice(0, 7) }
      );
    }
  }
}

/** Four tiles of the same size for every stage: runs, duration, loops, and one of the stage's own. */
export function stageKpis(
  node: FlowNode,
  detail: IssueDetail,
  model: FlowModel,
  artifacts: StageArtifacts = {}
): readonly Kpi[] {
  const loops = loopsOf(node.id, model);
  const receives = RECEIVES_LOOPS.has(node.id);
  const loopCount = receives ? loops.to : loops.from;
  return [
    {
      id: "runs",
      label: "desk.inspector.kpi.runs",
      value: { kind: "count", value: node.metrics?.runs ?? 0 },
      tone: "neutral"
    },
    {
      id: "duration",
      label:
        node.metrics?.ongoing !== true
          ? "desk.inspector.kpi.lastRun"
          : node.status === "waiting"
            ? "desk.inspector.kpi.waiting"
            : "desk.inspector.kpi.running",
      value:
        node.metrics === null
          ? { kind: "none" }
          : { kind: "duration", ms: node.metrics.lastDurationMs },
      tone: node.metrics?.ongoing === true ? "information" : "neutral"
    },
    {
      id: "loops",
      label: receives ? "desk.inspector.kpi.cameBack" : "desk.inspector.kpi.wentBack",
      value: { kind: "count", value: loopCount },
      tone: loopCount > 0 ? "warning" : "neutral"
    },
    stageKpi(node, detail, artifacts)
  ];
}

// --- checklists -------------------------------------------------------------

export type CheckState = "pass" | "fail" | "warn" | "pending";

export interface CheckItem {
  readonly id: string;
  readonly state: CheckState;
  readonly text: ItemText;
  readonly detail: ItemText | null;
  /** How long a check step ran. */
  readonly durationMs?: number;
}

const yesNo = (value: boolean | null): CheckState =>
  value === null ? "pending" : value ? "pass" : "fail";

/** The four rules the ship gate re-checks. `null` (not known yet) is pending, never a pass. */
export const shipChecklist = (ship: ShipReadiness): readonly CheckItem[] =>
  (
    [
      ["check", "desk.gate.ready.check", ship.checkPassed],
      ["review", "desk.gate.ready.review", ship.reviewApproved],
      ["same-diff", "desk.gate.ready.sameDiff", ship.reviewedDiffMatches],
      ["worktree", "desk.gate.ready.worktree", ship.currentDiffMatches]
    ] as const
  ).map(([id, label, value]) => ({ id, state: yesNo(value), text: key(label), detail: null }));

/** The six-heading issue contract: one row for the count, one failing row for each missing heading. */
export const contractChecklist = (contract: ContractProgress | null): readonly CheckItem[] =>
  contract === null
    ? []
    : [
        {
          id: "sections",
          state: contract.found === contract.total ? "pass" : "fail",
          text: key("desk.ticket.contractProgress", {
            found: contract.found,
            total: contract.total
          }),
          detail: null
        },
        ...contract.missing.map((name): CheckItem => ({
          id: `missing-${name}`,
          state: "fail",
          text: raw(name),
          detail: key("desk.inspector.contractMissing")
        }))
      ];

/** Each acceptance criterion of the plan, with the change that satisfies it. Mapped means passed. */
export const planChecklist = (plan: PlannerOutput): readonly CheckItem[] =>
  plan.acceptanceCriteria.map((entry, index) => ({
    id: `criterion-${String(index)}`,
    state: entry.change.trim() === "" ? "fail" : "pass",
    text: raw(entry.criterion),
    detail: entry.change.trim() === "" ? null : raw(entry.change)
  }));

/** Blockers fail. Claimed checks are the builder's word: a pass, a fail, or not run. */
export const buildChecklist = (build: BuilderOutput): readonly CheckItem[] => [
  ...build.blockers.map((blocker, index): CheckItem => ({
    id: `blocker-${String(index)}`,
    state: "fail",
    text: raw(blocker),
    detail: key("desk.inspector.blocker")
  })),
  ...build.claimedChecks.map((check, index): CheckItem => ({
    id: `claimed-${String(index)}`,
    state: check.result === "pass" ? "pass" : check.result === "fail" ? "fail" : "pending",
    text: raw(check.command),
    detail: key(`desk.build.result.${check.result}`)
  }))
];

export const stepPassed = (step: CheckSummary["steps"][number]): boolean =>
  step.code === 0 && !step.timedOut;

/** The engine's own check steps, each passed or failed with how long it ran. */
export const checkChecklist = (check: CheckSummary): readonly CheckItem[] =>
  check.steps.map((step, index) => ({
    id: `step-${String(index)}`,
    state: stepPassed(step) ? "pass" : "fail",
    text: raw(step.argv.join(" ")),
    detail: step.timedOut
      ? key("desk.check.timedOut")
      : key("desk.check.exit", { code: step.code ?? "-" }),
    durationMs: step.durationMs
  }));

/** The reviewer's verdict on each acceptance criterion, with its evidence. */
export const reviewChecklist = (view: ReviewArtifactView): readonly CheckItem[] =>
  view.review.acceptanceStatus.map((entry, index) => ({
    id: `acceptance-${String(index)}`,
    state: entry.status === "met" ? "pass" : entry.status === "partial" ? "warn" : "fail",
    text: raw(entry.criterion),
    detail: raw(entry.evidence)
  }));

// --- anomalies --------------------------------------------------------------

export type Anomaly =
  | {
      readonly kind: "loop";
      readonly loop: "check" | "review" | "feedback";
      readonly count: number;
    }
  | { readonly kind: "needs-you"; readonly excerpt: string }
  | { readonly kind: "denials"; readonly count: number }
  | { readonly kind: "same-failure" }
  | { readonly kind: "cancelled" };

export const ANOMALY_TONE: Readonly<Record<Anomaly["kind"], Tone>> = {
  loop: "warning",
  "needs-you": "danger",
  denials: "warning",
  "same-failure": "danger",
  cancelled: "neutral"
};

/** The engine logs a denied tool call as "<role>: blocked by the permission rules. …". */
const DENIAL_MARK = ": blocked by the permission rules";

/**
 * The issue stopped right after a failed check whose note equals the failed check before it:
 * the engine saw the same failure twice and stopped early instead of looping again.
 */
export function sameFailureStop(history: readonly HistoryEvent[]): boolean {
  const stop = history.at(-1);
  const last = history.at(-2);
  if (stop?.event !== "needs-you" || last?.event !== "check-failed" || last.note === undefined) {
    return false;
  }
  const earlier = history
    .slice(0, -2)
    .reverse()
    .find((event) => event.event === "check-failed");
  return earlier?.note === last.note;
}

/** What went wrong or around in a stage: loops, a stop, denied tool calls, an early stop. */
export function anomaliesOf(
  node: FlowNode,
  detail: IssueDetail,
  model: FlowModel,
  logs: readonly LogEntry[]
): readonly Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const edge of model.edges) {
    if (!edge.dashed || edge.from !== node.id) continue;
    if (edge.count > 0 && (edge.loopKind === "check" || edge.loopKind === "review")) {
      anomalies.push({ kind: "loop", loop: edge.loopKind, count: edge.count });
    }
    if (edge.feedbackCount > 0) {
      anomalies.push({ kind: "loop", loop: "feedback", count: edge.feedbackCount });
    }
  }
  if (node.badge?.kind === "needs-you") {
    const reason = detail.summary.readable ? detail.summary.needsYouReason : null;
    const text = reason ?? node.badge.text ?? "";
    anomalies.push({ kind: "needs-you", excerpt: reasonExcerpt(text) });
  }
  if (node.badge?.kind === "cancelled") anomalies.push({ kind: "cancelled" });
  if (node.role !== null) {
    const mark = `${node.role}${DENIAL_MARK}`;
    const count = logs.filter((entry) => entry.text.startsWith(mark)).length;
    if (count > 0) anomalies.push({ kind: "denials", count });
  }
  const stopsHere = node.id === "check" || node.badge?.kind === "needs-you";
  if (stopsHere && sameFailureStop(detail.state.history)) {
    anomalies.push({ kind: "same-failure" });
  }
  return anomalies;
}
