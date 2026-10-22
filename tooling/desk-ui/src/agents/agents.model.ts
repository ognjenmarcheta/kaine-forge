import {
  CAPABILITY_PRESETS,
  agentDefinitionSchema,
  validateAgent,
  type AgentDefinition,
  type AgentOutputKind,
  type AgentView,
  type CapabilityPreset,
  type DefinitionSource,
  type Provider
} from "@repo/desk/contracts";

/**
 * The agent form as the owner types it, and the rules the page can check before the server
 * does. The server validates every save again; the capability policy floor stays on the server.
 */

export interface AgentDraft {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly provider: Provider;
  /** Empty: the CLI's default model. */
  readonly model: string;
  readonly output: AgentOutputKind;
  readonly preset: CapabilityPreset;
  readonly mcp: readonly string[];
  readonly skills: readonly string[];
  /** Empty: the desk's default timeout. */
  readonly timeout: string;
  readonly prompt: string;
}

export const EMPTY_DRAFT: AgentDraft = {
  id: "",
  name: "",
  description: "",
  provider: "claude",
  model: "",
  output: "report",
  preset: "read-only",
  mcp: [],
  skills: [],
  timeout: "",
  prompt: ""
};

export const draftOf = (definition: AgentDefinition): AgentDraft => ({
  id: definition.id,
  name: definition.name,
  description: definition.description,
  provider: definition.provider,
  model: definition.model ?? "",
  output: definition.output,
  preset: definition.capabilities.preset,
  mcp: definition.capabilities.mcp,
  skills: definition.capabilities.skills,
  timeout: definition.timeoutMinutes === undefined ? "" : String(definition.timeoutMinutes),
  prompt: definition.prompt
});

const WHOLE_NUMBER = /^\d+$/;

/** The definition a save sends. A timeout that is not a whole number stays a number the schema refuses. */
export const definitionOf = (draft: AgentDraft): AgentDefinition => {
  const model = draft.model.trim();
  const timeout = draft.timeout.trim();
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    provider: draft.provider,
    ...(model === "" ? {} : { model }),
    output: draft.output,
    capabilities: { preset: draft.preset, mcp: [...draft.mcp], skills: [...draft.skills] },
    ...(timeout === ""
      ? {}
      : { timeoutMinutes: WHOLE_NUMBER.test(timeout) ? Number(timeout) : -1 }),
    prompt: draft.prompt.trim()
  };
};

/** The form fields an error can belong to. */
export const AGENT_FIELDS = [
  "id",
  "name",
  "description",
  "provider",
  "model",
  "output",
  "preset",
  "mcp",
  "skills",
  "timeoutMinutes",
  "prompt"
] as const;
export type AgentField = (typeof AGENT_FIELDS)[number];

/** A definition path (`capabilities.preset`, from the schema or the server) as a form field. */
const FIELD_OF_PATH: Readonly<Record<string, AgentField>> = {
  id: "id",
  name: "name",
  description: "description",
  provider: "provider",
  model: "model",
  output: "output",
  "capabilities.preset": "preset",
  "capabilities.mcp": "mcp",
  "capabilities.skills": "skills",
  timeoutMinutes: "timeoutMinutes",
  prompt: "prompt"
};

export const fieldOfPath = (path: string): AgentField | null => FIELD_OF_PATH[path] ?? null;

/** What the page can say about a field before a save. The page words each kind itself. */
export type DraftProblem =
  | { readonly field: AgentField; readonly kind: "invalid" }
  | { readonly field: "id"; readonly kind: "taken" }
  | { readonly field: "preset"; readonly kind: "preset" };

/**
 * The problems of a draft: the contract's schema, `validateAgent`, and, for a new agent, an id
 * that another agent has. Each field reports once.
 */
export function draftProblems(
  draft: AgentDraft,
  takenIds: readonly string[] | null
): DraftProblem[] {
  const definition = definitionOf(draft);
  const problems: DraftProblem[] = [];
  const seen = new Set<AgentField>();
  const add = (problem: DraftProblem): void => {
    if (seen.has(problem.field)) return;
    seen.add(problem.field);
    problems.push(problem);
  };
  const parsed = agentDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldOfPath(issue.path.map(String).join("."));
      if (field !== null) add({ field, kind: "invalid" });
    }
  }
  for (const error of validateAgent(definition)) {
    const field = error.field === null ? null : fieldOfPath(error.field);
    if (field === "preset") add({ field, kind: "preset" });
    else if (field !== null) add({ field, kind: "invalid" });
  }
  if (takenIds?.includes(definition.id) === true) add({ field: "id", kind: "taken" });
  return problems;
}

/** Whether `validateAgent` accepts `preset` with the draft's output. */
export const presetFits = (draft: AgentDraft, preset: CapabilityPreset): boolean =>
  !validateAgent(definitionOf({ ...draft, preset })).some(
    (error) => error.field === "capabilities.preset"
  );

/** A changed output keeps the preset when it still fits, or takes the first that does. */
export function withOutput(draft: AgentDraft, output: AgentOutputKind): AgentDraft {
  const next = { ...draft, output };
  if (presetFits(next, next.preset)) return next;
  const preset = CAPABILITY_PRESETS.find((candidate) => presetFits(next, candidate));
  return preset === undefined ? next : { ...next, preset };
}

export interface ServerProblem {
  readonly field: AgentField | null;
  /** Engine text: shown as it is. */
  readonly message: string;
}

/** The `invalid-definition` detail, one problem per line (`field: message`), with its field when the line names one. */
export function serverProblems(detail: string | null): ServerProblem[] {
  if (detail === null) return [];
  return detail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const match = /^([A-Za-z][A-Za-z.]*): (.+)$/.exec(line);
      const field = match?.[1] === undefined ? null : fieldOfPath(match[1]);
      return field === null || match?.[2] === undefined
        ? { field: null, message: line }
        : { field, message: match[2] };
    });
}

/**
 * The engine's reason for a capability a checkout does not have. The agents API has no list
 * of installed MCP servers and skills, so the page learns them from the agents it lists.
 */
export const NOT_INSTALLED_REASON = "not installed";

export interface Installed {
  readonly mcp: readonly string[];
  readonly skills: readonly string[];
}

/**
 * The MCP servers and skills this checkout has, as far as the listed agents show: every name an
 * agent asks for, except the names the resolver removed as not installed.
 */
export function installedOf(agents: readonly AgentView[]): Installed {
  const collect = (kind: "mcp" | "skills"): string[] => {
    const removedKind = kind === "mcp" ? "mcp" : "skill";
    const names = new Set<string>();
    for (const agent of agents) {
      const missing = new Set(
        agent.resolved.removed
          .filter((entry) => entry.kind === removedKind && entry.reason === NOT_INSTALLED_REASON)
          .map((entry) => entry.name)
      );
      for (const name of [...agent.definition.capabilities[kind], ...agent.resolved[kind]]) {
        if (!missing.has(name)) names.add(name);
      }
    }
    return [...names].sort();
  };
  return { mcp: collect("mcp"), skills: collect("skills") };
}

// --- the library -----------------------------------------------------------------------------

export type SourceFilter = "all" | DefinitionSource;
export type OutputFilter = "all" | AgentOutputKind;

export interface AgentFilter {
  readonly query: string;
  readonly source: SourceFilter;
  readonly output: OutputFilter;
}

/** Agents whose name, id, or description has the query, from the chosen source and output. */
export function filterAgents(agents: readonly AgentView[], filter: AgentFilter): AgentView[] {
  const needle = filter.query.trim().toLocaleLowerCase();
  return agents.filter(
    ({ definition, source }) =>
      (filter.source === "all" || filter.source === source) &&
      (filter.output === "all" || filter.output === definition.output) &&
      (needle === "" ||
        [definition.name, definition.id, definition.description].some((text) =>
          text.toLocaleLowerCase().includes(needle)
        ))
  );
}

/** The id a copy of `id` suggests. The owner changes it when another agent has it. */
export const copyIdOf = (id: string): string => `${id}-copy`.slice(0, 64);
