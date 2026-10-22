import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadRegistry } from "./registry.load";
import { parseAgentFile, parseFlowFile } from "./registry.parse";
import {
  validateFlow,
  type AgentDefinition,
  type DefinitionSource,
  type DeskConfig,
  type FlowDefinition,
  type FlowSnapshot,
  type FlowStep,
  type InstalledCapabilities
} from "../contracts";

/**
 * The flow snapshot an issue runs on: the flow and every agent it names, resolved once at
 * Start and stored in the issue state. Later edits of the definition files reach only the
 * issues started after them.
 */

/** The flow every issue runs on until the owner can choose one. */
export const DEFAULT_FLOW_ID = "kaine-default";

const BUILTIN_DIR = fileURLToPath(new URL("../../defaults/", import.meta.url));

export type FlowSnapshotResult =
  | { readonly ok: true; readonly snapshot: FlowSnapshot }
  | { readonly ok: false; readonly reason: string };

/** Keys sorted at every level, so the hash does not depend on the order in a file. */
const normalize = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    typeof entry === "object" && entry !== null && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry
  );

/** The snapshot of `flow` with the agents its steps name, in step order, each once. */
const snapshotOf = (
  flow: FlowDefinition,
  flowSource: DefinitionSource,
  available: readonly AgentDefinition[]
): FlowSnapshotResult => {
  const agents: AgentDefinition[] = [];
  for (const step of flow.steps) {
    if (step.kind !== "agent" || agents.some((agent) => agent.id === step.agent)) continue;
    const agent = available.find((entry) => entry.id === step.agent);
    if (agent === undefined) {
      return { ok: false, reason: `Flow '${flow.id}' names the unknown agent '${step.agent}'.` };
    }
    agents.push(agent);
  }
  const hash = createHash("sha256").update(normalize({ flow, agents })).digest("hex");
  return { ok: true, snapshot: { flow, agents, hash, flowSource } };
};

/**
 * Rules the engine needs before it runs a flow, beyond `validateFlow`. An automatic ship
 * arrives later: until then a ship always waits for the owner at the gate before it.
 */
const runnableProblems = (flow: FlowDefinition): string[] =>
  flow.steps.flatMap((step, index) => {
    if (step.kind !== "ship") return [];
    if (step.auto) {
      return [
        `Step '${step.id}': an automatic ship (auto: true) is not supported yet. Set auto: false, so the owner confirms each ship.`
      ];
    }
    return flow.steps[index - 1]?.kind === "gate"
      ? []
      : [
          `Step '${step.id}': a ship step must come directly after a gate, where the owner confirms it.`
        ];
  });

/**
 * The desk config's loop limits are the limits of the built-in default flow. A flow from the
 * repository or a developer carries its own.
 */
const withConfigLimits = (flow: FlowDefinition, config: DeskConfig): FlowDefinition => ({
  ...flow,
  steps: flow.steps.map((step): FlowStep => {
    if (step.kind === "pr-wait") return { ...step, maxRounds: config.maxPrRounds };
    if (step.loopBack === undefined) return step;
    const limit =
      step.kind === "check"
        ? config.maxTestLoops
        : step.kind === "agent" && step.agent === "reviewer"
          ? config.maxReviewLoops
          : step.loopBack.limit;
    return { ...step, loopBack: { ...step.loopBack, limit } };
  })
});

export interface ResolveFlowInput {
  readonly repoRoot: string;
  readonly installed: InstalledCapabilities;
  readonly config: DeskConfig;
  readonly flowId?: string | undefined;
}

/** The snapshot for a new issue, from the registry of this checkout. */
export const resolveFlowSnapshot = async (input: ResolveFlowInput): Promise<FlowSnapshotResult> => {
  const flowId = input.flowId ?? DEFAULT_FLOW_ID;
  const registry = await loadRegistry({ repoRoot: input.repoRoot, installed: input.installed });
  const entry = registry.flows.find((candidate) => candidate.definition.id === flowId);
  if (entry === undefined) {
    const problems = registry.problems.flatMap((problem) =>
      problem.errors.map((error) => `${problem.path}: ${error}`)
    );
    return {
      ok: false,
      reason: [`The flow '${flowId}' is not available.`, ...problems].join("\n")
    };
  }
  const problems = runnableProblems(entry.definition);
  if (problems.length > 0) {
    return { ok: false, reason: [`The flow '${flowId}' cannot run:`, ...problems].join("\n") };
  }
  const flow =
    entry.source === "builtin" && flowId === DEFAULT_FLOW_ID
      ? withConfigLimits(entry.definition, input.config)
      : entry.definition;
  return snapshotOf(
    flow,
    entry.source,
    registry.agents.map((agent) => agent.definition)
  );
};

/** The MCP servers in `.ai/mcp.json` and the skills in `.ai/skills` of a checkout. */
export const readInstalledCapabilities = async (
  repoRoot: string
): Promise<InstalledCapabilities> => {
  let mcp: string[] = [];
  try {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(repoRoot, ".ai", "mcp.json"), "utf8")
    );
    if (typeof parsed === "object" && parsed !== null && "mcpServers" in parsed) {
      const servers = parsed.mcpServers;
      if (typeof servers === "object" && servers !== null) mcp = Object.keys(servers);
    }
  } catch {
    // No readable file: no server is installed.
  }
  let skills: string[] = [];
  try {
    skills = (await readdir(path.join(repoRoot, ".ai", "skills")))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -".md".length));
  } catch {
    // No skills directory: no skill is installed.
  }
  return { mcp, skills };
};

const parsedOrThrow = <T>(
  file: string,
  result:
    | { readonly ok: true; readonly definition: T }
    | { readonly ok: false; readonly errors: readonly string[] }
): T => {
  if (!result.ok)
    throw new Error(`Built-in definition ${file} is invalid: ${result.errors.join("; ")}`);
  return result.definition;
};

const loadBuiltin = async (): Promise<FlowSnapshot> => {
  const agentsDir = path.join(BUILTIN_DIR, "agents");
  const agents = await Promise.all(
    (await readdir(agentsDir))
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map(async (name) => {
        const file = path.join(agentsDir, name);
        return parsedOrThrow(file, parseAgentFile(await readFile(file, "utf8")));
      })
  );
  const flowFile = path.join(BUILTIN_DIR, "flows", `${DEFAULT_FLOW_ID}.yaml`);
  const flow = parsedOrThrow(flowFile, parseFlowFile(await readFile(flowFile, "utf8")));
  const errors = validateFlow(flow, agents);
  if (errors.length > 0) {
    throw new Error(`Built-in flow is invalid: ${errors.map((error) => error.message).join("; ")}`);
  }
  const result = snapshotOf(flow, "builtin", agents);
  if (!result.ok) throw new Error(result.reason);
  return result.snapshot;
};

let builtin: Promise<FlowSnapshot> | null = null;

/**
 * The built-in default flow with the built-in agents, exactly as shipped. A version 1 state
 * migrates onto it. It reads no checkout, so it never depends on what a repository installed.
 */
export const builtinFlowSnapshot = (): Promise<FlowSnapshot> => {
  builtin ??= loadBuiltin().catch((error: unknown) => {
    builtin = null;
    throw error;
  });
  return builtin;
};
