import {
  CHECK_SETS,
  isTerminalStage,
  validateFlow,
  type AgentDefinition,
  type FlowDefinition,
  type FlowStep,
  type IssueSummary,
  type StepKind
} from "@repo/desk/contracts";

/**
 * The flow editor's one draft, and every edit both of its views make: the list and form, and
 * the canvas. The canvas never changes a flow by itself; it calls the same operations. Each
 * step has a `key` that stays while its id changes, so focus and selection follow the step.
 * The server validates every save again.
 */

export interface LoopBackDraft {
  readonly to: string;
  /** As typed. A save sends a whole number; anything else fails the "at least 1" rule. */
  readonly limit: string;
  readonly stopOnSameFailure: boolean;
}

/** A named command set of the desk config, or the owner's own commands. */
export type CommandSet = (typeof CHECK_SETS)[number] | "custom";

/** One step as the form holds it. Only the fields of its `kind` reach the definition. */
export interface StepDraft {
  readonly key: string;
  readonly kind: StepKind;
  readonly id: string;
  readonly label: string;
  readonly loopBack: LoopBackDraft | null;
  /** `agent` */
  readonly agent: string;
  /** `gate` */
  readonly sendBack: readonly string[];
  /** `check` */
  readonly commandSet: CommandSet;
  /** `check` with `custom`: one command per line, its words separated by spaces. */
  readonly commands: string;
  /** `ship` */
  readonly auto: boolean;
  /** `pr-wait`, as typed. */
  readonly maxRounds: string;
  /** `pr-wait` */
  readonly backTo: string;
}

export interface FlowDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly StepDraft[];
}

let keySeed = 0;
const newKey = (): string => {
  keySeed += 1;
  return `step-${String(keySeed)}`;
};

const BLANK: Omit<StepDraft, "key" | "kind" | "id" | "label"> = {
  loopBack: null,
  agent: "",
  sendBack: [],
  commandSet: "loop",
  commands: "",
  auto: false,
  maxRounds: "3",
  backTo: ""
};

const WHOLE_NUMBER = /^\d+$/;
/** A whole number as typed, or 0: the rules then say it must be at least 1. */
const wholeOrZero = (text: string): number => {
  const trimmed = text.trim();
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : 0;
};

/** The commands of a custom check: one per line, words split at spaces, blank lines left out. */
export const parseCommands = (text: string): string[][] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => line.split(/\s+/));

const stepDraftOf = (step: FlowStep): StepDraft => {
  const base: StepDraft = {
    ...BLANK,
    key: newKey(),
    kind: step.kind,
    id: step.id,
    label: step.label,
    loopBack:
      step.loopBack === undefined
        ? null
        : {
            to: step.loopBack.to,
            limit: String(step.loopBack.limit),
            stopOnSameFailure: step.loopBack.stopOnSameFailure === true
          }
  };
  switch (step.kind) {
    case "agent":
      return { ...base, agent: step.agent };
    case "gate":
      return { ...base, sendBack: step.sendBack };
    case "check":
      return typeof step.commands === "string"
        ? { ...base, commandSet: step.commands }
        : {
            ...base,
            commandSet: "custom",
            commands: step.commands.map((argv) => argv.join(" ")).join("\n")
          };
    case "ship":
      return { ...base, auto: step.auto };
    case "pr-wait":
      return { ...base, maxRounds: String(step.maxRounds), backTo: step.backTo };
  }
};

export const draftOf = (flow: FlowDefinition): FlowDraft => ({
  id: flow.id,
  name: flow.name,
  description: flow.description,
  steps: flow.steps.map(stepDraftOf)
});

const stepOf = (step: StepDraft): FlowStep => {
  const base = {
    id: step.id.trim(),
    label: step.label.trim(),
    ...(step.loopBack === null
      ? {}
      : {
          loopBack: {
            to: step.loopBack.to,
            limit: wholeOrZero(step.loopBack.limit),
            ...(step.loopBack.stopOnSameFailure ? { stopOnSameFailure: true } : {})
          }
        })
  };
  switch (step.kind) {
    case "agent":
      return { ...base, kind: "agent", agent: step.agent };
    case "gate":
      return { ...base, kind: "gate", sendBack: [...step.sendBack] };
    case "check":
      return {
        ...base,
        kind: "check",
        commands: step.commandSet === "custom" ? parseCommands(step.commands) : step.commandSet
      };
    case "ship":
      return { ...base, kind: "ship", auto: step.auto };
    case "pr-wait":
      return {
        ...base,
        kind: "pr-wait",
        maxRounds: wholeOrZero(step.maxRounds),
        backTo: step.backTo
      };
  }
};

/** The definition a save sends and the rules check. */
export const definitionOf = (draft: FlowDraft): FlowDefinition => ({
  id: draft.id,
  name: draft.name.trim(),
  description: draft.description.trim(),
  steps: draft.steps.map(stepOf)
});

/** Whether the draft would save something other than `baseline`. */
export const isChanged = (draft: FlowDraft, baseline: FlowDefinition): boolean =>
  JSON.stringify(definitionOf(draft)) !== JSON.stringify(definitionOf(draftOf(baseline)));

// --- problems --------------------------------------------------------------------------------

/** Form fields the page checks itself, before the rules: the page words each one. */
export type FieldProblem =
  | { readonly key: null; readonly field: "name" | "description" }
  | { readonly key: string; readonly field: "label" | "commands" | "maxRounds" };

/** A rule of `validateFlow` or a line of a refused save. The message is engine text. */
export interface RuleProblem {
  /** The step it belongs to, or `null` for the flow as a whole. */
  readonly key: string | null;
  readonly message: string;
}

export interface FlowProblems {
  readonly fields: readonly FieldProblem[];
  readonly rules: readonly RuleProblem[];
}

/** The keys of the steps with `id`. Two steps can share an id; the rules then say so under both. */
const keysOfId = (draft: FlowDraft, id: string): string[] =>
  draft.steps.filter((step) => step.id.trim() === id).map((step) => step.key);

/** Engine messages, under the steps they name. A step id that no step has goes to the flow. */
const underSteps = (
  draft: FlowDraft,
  entries: readonly { readonly step: string | null; readonly message: string }[]
): RuleProblem[] =>
  entries.flatMap(({ step, message }): RuleProblem[] => {
    const keys = step === null ? [] : keysOfId(draft, step);
    return keys.length === 0 ? [{ key: null, message }] : keys.map((key) => ({ key, message }));
  });

/** What stops a save now: empty fields, then every rule of `validateFlow`. */
export function flowProblems(
  draft: FlowDraft,
  agents: readonly Pick<AgentDefinition, "id" | "output">[]
): FlowProblems {
  const fields: FieldProblem[] = [];
  if (draft.name.trim() === "") fields.push({ key: null, field: "name" });
  if (draft.description.trim() === "") fields.push({ key: null, field: "description" });
  for (const step of draft.steps) {
    if (step.label.trim() === "") fields.push({ key: step.key, field: "label" });
    if (
      step.kind === "check" &&
      step.commandSet === "custom" &&
      parseCommands(step.commands).length === 0
    ) {
      fields.push({ key: step.key, field: "commands" });
    }
    if (step.kind === "pr-wait" && wholeOrZero(step.maxRounds) < 1) {
      fields.push({ key: step.key, field: "maxRounds" });
    }
  }
  return { fields, rules: underSteps(draft, validateFlow(definitionOf(draft), agents)) };
}

export const hasProblems = (problems: FlowProblems): boolean =>
  problems.fields.length > 0 || problems.rules.length > 0;

/**
 * The `invalid-definition` detail of a refused save: one problem per line, `step '<id>': text`
 * for a step. Lines that name no step belong to the flow.
 */
export function serverProblems(draft: FlowDraft, detail: string | null): RuleProblem[] {
  if (detail === null) return [];
  return underSteps(
    draft,
    detail
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => {
        const match = /^step '([^']*)': (.+)$/.exec(line);
        return match?.[1] === undefined || match[2] === undefined
          ? { step: null, message: line }
          : { step: match[1], message: match[2] };
      })
  );
}

// --- edits -----------------------------------------------------------------------------------

const indexOfKey = (draft: FlowDraft, key: string): number =>
  draft.steps.findIndex((step) => step.key === key);

const withSteps = (draft: FlowDraft, steps: readonly StepDraft[]): FlowDraft => ({
  ...draft,
  steps
});

/** An id no step has: `base`, else `base-2`, `base-3`, and so on. */
export function freeId(draft: FlowDraft, base: string): string {
  const taken = new Set(draft.steps.map((step) => step.id.trim()));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base}-${String(count)}`)) count += 1;
  return `${base}-${String(count)}`;
}

export interface NewStep {
  readonly kind: StepKind;
  /** The label the page gives a new step: the kind's name in the owner's language. */
  readonly label: string;
  /** The agent a new agent step runs. */
  readonly agent: string;
}

/**
 * A new step at `at` (0 is first). Its id is free, a pr-wait step sends PR feedback back to
 * the nearest earlier agent step, and nothing else points anywhere yet.
 */
export function insertStep(
  draft: FlowDraft,
  at: number,
  step: NewStep
): { readonly draft: FlowDraft; readonly key: string } {
  const index = Math.max(0, Math.min(draft.steps.length, at));
  const earlier = draft.steps.slice(0, index);
  const lastAgent = earlier.filter((entry) => entry.kind === "agent").at(-1);
  const created: StepDraft = {
    ...BLANK,
    key: newKey(),
    kind: step.kind,
    id: freeId(draft, step.kind === "agent" && step.agent !== "" ? step.agent : step.kind),
    label: step.label,
    agent: step.kind === "agent" ? step.agent : "",
    backTo: step.kind === "pr-wait" ? ((lastAgent ?? earlier.at(-1))?.id.trim() ?? "") : ""
  };
  const steps = [...draft.steps];
  steps.splice(index, 0, created);
  return { draft: withSteps(draft, steps), key: created.key };
}

/**
 * Remove a step. A loop back or a send-back target that named it goes too. A pr-wait step's
 * `backTo` stays, and the rules say it names no earlier step.
 */
export function removeStep(draft: FlowDraft, key: string): FlowDraft {
  const removed = draft.steps.find((step) => step.key === key);
  if (removed === undefined) return draft;
  const id = removed.id.trim();
  const others = draft.steps.filter((step) => step.key !== key);
  const stillNamed = others.some((step) => step.id.trim() === id);
  if (stillNamed) return withSteps(draft, others);
  return withSteps(
    draft,
    others.map((step) => ({
      ...step,
      loopBack: step.loopBack?.to === id ? null : step.loopBack,
      sendBack: step.sendBack.filter((target) => target !== id)
    }))
  );
}

/**
 * Move a step to index `to`. References keep their ids: a loop back that now points to a later
 * step stays, and the rules flag it under its step.
 */
export function moveStep(draft: FlowDraft, key: string, to: number): FlowDraft {
  const from = indexOfKey(draft, key);
  const target = Math.max(0, Math.min(draft.steps.length - 1, to));
  const moving = draft.steps[from];
  if (moving === undefined || from === target) return draft;
  const steps = draft.steps.filter((step) => step.key !== key);
  steps.splice(target, 0, moving);
  return withSteps(draft, steps);
}

/** Change fields of one step. A new id carries every reference to the old id with it. */
export function updateStep(
  draft: FlowDraft,
  key: string,
  patch: Partial<Omit<StepDraft, "key" | "kind">>
): FlowDraft {
  const before = draft.steps.find((step) => step.key === key);
  if (before === undefined) return draft;
  const oldId = before.id.trim();
  const newId = patch.id?.trim();
  const rename = (id: string): string =>
    newId !== undefined && newId !== oldId && id === oldId ? newId : id;
  return withSteps(
    draft,
    draft.steps.map((step) => {
      const own = step.key === key ? { ...step, ...patch } : step;
      if (newId === undefined || newId === oldId) return own;
      return {
        ...own,
        loopBack: own.loopBack === null ? null : { ...own.loopBack, to: rename(own.loopBack.to) },
        sendBack: own.sendBack.map(rename),
        backTo: rename(own.backTo)
      };
    })
  );
}

/** The steps before `key`, nearest last: the only steps a reference may name. */
export const earlierSteps = (draft: FlowDraft, key: string): readonly StepDraft[] =>
  draft.steps.slice(0, Math.max(0, indexOfKey(draft, key)));

/** A loop back to the step just before, with a budget of two rounds. */
export const defaultLoopBack = (draft: FlowDraft, key: string): LoopBackDraft => ({
  to: earlierSteps(draft, key).at(-1)?.id.trim() ?? "",
  limit: "2",
  stopOnSameFailure: false
});

// --- back edges (the canvas) -----------------------------------------------------------------

/** The three ways a step points back: its loop back, a gate's send-back, a pr-wait's PR feedback. */
export const BACK_KINDS = ["loopBack", "sendBack", "backTo"] as const;
export type BackKind = (typeof BACK_KINDS)[number];

/** What a back edge from `source` to `target` can be. A pr-wait step always has its `backTo`. */
export const backKindsOf = (kind: StepKind): readonly BackKind[] =>
  kind === "gate"
    ? ["loopBack", "sendBack"]
    : kind === "pr-wait"
      ? ["loopBack", "backTo"]
      : ["loopBack"];

export type ConnectCheck =
  | { readonly ok: true; readonly choices: readonly BackKind[] }
  | { readonly ok: false; readonly reason: "later" | "unknown" };

/** Whether a drag from `source` may end on `target`: only an earlier step can take an edge. */
export function checkConnect(draft: FlowDraft, source: string, target: string): ConnectCheck {
  const from = indexOfKey(draft, source);
  const to = indexOfKey(draft, target);
  const step = draft.steps[from];
  if (step === undefined || to < 0) return { ok: false, reason: "unknown" };
  if (to >= from) return { ok: false, reason: "later" };
  return { ok: true, choices: backKindsOf(step.kind) };
}

/** Point `source` back to `target` as `as`. A loop back keeps its budget; a send-back target adds to the others. */
export function connectBack(
  draft: FlowDraft,
  source: string,
  target: string,
  as: BackKind
): FlowDraft {
  const check = checkConnect(draft, source, target);
  const to = draft.steps.find((step) => step.key === target)?.id.trim();
  if (!check.ok || !check.choices.includes(as) || to === undefined) return draft;
  return withSteps(
    draft,
    draft.steps.map((step) => {
      if (step.key !== source) return step;
      switch (as) {
        case "loopBack":
          return {
            ...step,
            loopBack:
              step.loopBack === null
                ? { to, limit: "2", stopOnSameFailure: false }
                : { ...step.loopBack, to }
          };
        case "sendBack":
          return step.sendBack.includes(to) ? step : { ...step, sendBack: [...step.sendBack, to] };
        case "backTo":
          return { ...step, backTo: to };
      }
    })
  );
}

export interface BackEdge {
  /** Stable for React Flow: `<kind>:<source key>:<target id>`. */
  readonly id: string;
  readonly kind: BackKind;
  readonly source: string;
  readonly target: string;
  /** The rules refuse it: the target is not earlier. */
  readonly invalid: boolean;
  /** `backTo` stays: change it to another step instead. */
  readonly removable: boolean;
  /** A loop back's budget, as typed. */
  readonly limit: string | null;
}

/** Every reference of the draft that names a step it has, as an edge from the later step. */
export function backEdgesOf(draft: FlowDraft): BackEdge[] {
  const edges: BackEdge[] = [];
  draft.steps.forEach((step, index) => {
    const add = (kind: BackKind, id: string, limit: string | null): void => {
      const target = draft.steps.findIndex((entry) => entry.id.trim() === id);
      const found = draft.steps[target];
      if (found === undefined || id === "") return;
      edges.push({
        id: `${kind}:${step.key}:${id}`,
        kind,
        source: step.key,
        target: found.key,
        invalid: target >= index,
        removable: kind !== "backTo",
        limit
      });
    };
    if (step.loopBack !== null) add("loopBack", step.loopBack.to, step.loopBack.limit);
    if (step.kind === "gate") for (const id of step.sendBack) add("sendBack", id, null);
    if (step.kind === "pr-wait") add("backTo", step.backTo, null);
  });
  return edges;
}

/** Remove a removable back edge. */
export function removeBackEdge(draft: FlowDraft, edge: BackEdge): FlowDraft {
  const target = draft.steps.find((step) => step.key === edge.target)?.id.trim();
  if (!edge.removable || target === undefined) return draft;
  return withSteps(
    draft,
    draft.steps.map((step) => {
      if (step.key !== edge.source) return step;
      return edge.kind === "loopBack"
        ? { ...step, loopBack: null }
        : { ...step, sendBack: step.sendBack.filter((id) => id !== target) };
    })
  );
}

// --- the canvas slots ------------------------------------------------------------------------

/** Canvas units: a step's card and the distance between two columns. `.desk-flows-node` has the same size. */
export const CANVAS_NODE = { width: 112, height: 72 } as const;
export const CANVAS_GAP = 144;

/** The x of column `column`. Column 0 is setup; step `i` is in column `i + 1`. */
export const columnX = (column: number): number => column * CANVAS_GAP;

/**
 * The index a step with its center at `x` takes among `count` steps: the number of step
 * columns whose center is left of it. `moving`: the index of a step being dragged, whose own
 * column does not count.
 */
export function slotAt(x: number, count: number, moving = -1): number {
  let slot = 0;
  for (let index = 0; index < count; index += 1) {
    if (index !== moving && columnX(index + 1) + CANVAS_NODE.width / 2 < x) slot += 1;
  }
  return slot;
}

// --- the library -----------------------------------------------------------------------------

/** Issues on the desk that run on `flowId` and have not ended. */
export const activeIssuesOn = (issues: readonly IssueSummary[], flowId: string): number =>
  issues.filter(
    (issue) => issue.readable && issue.flowId === flowId && !isTerminalStage(issue.stage)
  ).length;
