import { HUMAN_GATES, type IssueState } from "../contracts";
import type { GitHubPort } from "../ports";

/**
 * Execution labels. They show where an agent run stands, and they are
 * mutually exclusive. The desk never adds or removes a triage label such as
 * `ready-for-agent`: only labels in this set are ever planned.
 */
export const AGENT_LABELS = ["agent:working", "agent:needs-you", "agent:pr-open"] as const;
export type AgentLabel = (typeof AGENT_LABELS)[number];

export interface LabelDefinition {
  readonly name: AgentLabel;
  readonly color: string;
  readonly description: string;
}

export const LABEL_DEFINITIONS: readonly LabelDefinition[] = [
  {
    name: "agent:working",
    color: "1d76db",
    description: "The agent desk is working on this issue"
  },
  {
    name: "agent:needs-you",
    color: "fbca04",
    description: "The agent desk waits for the repository owner"
  },
  {
    name: "agent:pr-open",
    color: "0e8a16",
    description: "The agent desk opened a draft pull request"
  }
];

export interface LabelChange {
  readonly add: readonly AgentLabel[];
  readonly remove: readonly AgentLabel[];
}

const isAgentLabel = (name: string): name is AgentLabel =>
  AGENT_LABELS.some((label) => label === name);

/**
 * Pure. Given the labels on an issue, return the edits that leave exactly
 * `target` among the agent labels (`null` leaves none). Other labels are
 * ignored, so a triage label can never appear in the result.
 */
export const planLabelChange = (
  current: readonly string[],
  target: AgentLabel | null
): LabelChange => ({
  add: target !== null && !current.includes(target) ? [target] : [],
  remove: current.filter(isAgentLabel).filter((label) => label !== target)
});

export const isEmptyChange = (change: LabelChange): boolean =>
  change.add.length === 0 && change.remove.length === 0;

/** The execution label that matches an issue's state, or `null` for none. */
export const labelForState = (state: IssueState): AgentLabel | null => {
  if (state.stage === "shipped") return "agent:pr-open";
  if (state.stage === "cancelled") return null;
  if (state.stage === "needs-you" || HUMAN_GATES.some((gate) => gate === state.stage)) {
    return "agent:needs-you";
  }
  switch (state.status) {
    case "running":
    case "queued":
      return "agent:working";
    case "waiting":
    case "failed":
      return "agent:needs-you";
    case "idle":
    case "done":
      return null;
  }
};

export type WriteBackOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Run a GitHub write that must not fail the stage. Failures go to `log`. */
export const bestEffort = async (
  what: string,
  action: () => Promise<unknown>,
  log: (message: string) => void
): Promise<WriteBackOutcome> => {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`write-back skipped (${what}): ${message}`);
    return { ok: false, error: message };
  }
};

export const applyLabelChange = (
  github: Pick<GitHubPort, "editLabels">,
  issueNumber: number,
  change: LabelChange,
  log: (message: string) => void
): Promise<WriteBackOutcome> =>
  isEmptyChange(change)
    ? Promise.resolve({ ok: true })
    : bestEffort("labels", () => github.editLabels(issueNumber, change), log);

/** `gh label create` argv for each label. `--force` makes a re-run update the label. */
export const labelCreateArgv = (definition: LabelDefinition): string[] => [
  "label",
  "create",
  definition.name,
  "--color",
  definition.color,
  "--description",
  definition.description,
  "--force"
];

const quoteArg = (value: string): string => (/^[\w:.-]+$/.test(value) ? value : `"${value}"`);

/** Printable form of `labelCreateArgv`. The values contain no shell metacharacters. */
export const labelSyncCommands = (): string[] =>
  LABEL_DEFINITIONS.map(
    (definition) => `gh ${labelCreateArgv(definition).map(quoteArg).join(" ")}`
  );
