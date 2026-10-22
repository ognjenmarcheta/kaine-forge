import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAgentFile, parseFlowFile, type ParseResult } from "./registry.parse";
import {
  DEFINITION_SOURCES,
  validateAgent,
  validateFlow,
  type AgentDefinition,
  type DefinitionSource,
  type FlowDefinition,
  type InstalledCapabilities
} from "../contracts";

/**
 * The agents and flows a checkout can use, from three sources. A later source
 * overrides an earlier one by id: built-in < repo < local.
 *
 * - builtin: `tooling/desk/defaults/{agents,flows}`, shipped with the desk and read-only;
 * - repo: `<repoRoot>/.desk/{agents,flows}`, tracked and shared;
 * - local: `<repoRoot>/.ai.local/desk/{agents,flows}`, gitignored and personal.
 *
 * A file that does not parse or validate is reported in `problems` and takes
 * part in nothing: it never throws and never shadows a valid definition.
 * Files whose name is not `<id>.md` or `<id>.yaml` are ignored.
 */

export interface RegistryEntry<T> {
  readonly definition: T;
  readonly source: DefinitionSource;
  /** The source of the definition with the same id that this one overrides, or `null`. */
  readonly shadows: DefinitionSource | null;
  readonly path: string;
  /** sha256 of the normalized definition: what a run snapshots. */
  readonly hash: string;
  /** Built-in definitions change only with the desk. Override the id to change one. */
  readonly readOnly: boolean;
}

export interface RegistryProblem {
  readonly path: string;
  readonly source: DefinitionSource;
  readonly errors: readonly string[];
}

export interface Registry {
  readonly agents: readonly RegistryEntry<AgentDefinition>[];
  readonly flows: readonly RegistryEntry<FlowDefinition>[];
  readonly problems: readonly RegistryProblem[];
}

export interface LoadRegistryInput {
  readonly repoRoot: string;
  /** What the checkout installed. Agents that need anything else are problems. */
  readonly installed: InstalledCapabilities;
}

const BUILTIN_DIR = fileURLToPath(new URL("../../defaults/", import.meta.url));

const sourceDirs = (repoRoot: string): Readonly<Record<DefinitionSource, string>> => ({
  builtin: BUILTIN_DIR,
  repo: path.join(repoRoot, ".desk"),
  local: path.join(repoRoot, ".ai.local", "desk")
});

const AGENT_FILE = /^([a-z0-9][a-z0-9-]{0,63})\.md$/;
const FLOW_FILE = /^([a-z0-9][a-z0-9-]{0,63})\.yaml$/;

const isMissing = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

/** Keys sorted at every level, so the hash does not depend on the order in the file. */
const normalize = (definition: AgentDefinition | FlowDefinition): string =>
  JSON.stringify(definition, (_key, value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value
  );

const hashOf = (definition: AgentDefinition | FlowDefinition): string =>
  createHash("sha256").update(normalize(definition)).digest("hex");

interface Candidate<T> {
  readonly definition: T;
  readonly source: DefinitionSource;
  readonly path: string;
}

/** Every well-formed definition in one directory. Malformed files go to `problems`. */
const readDir = async <T extends { readonly id: string }>(
  dir: string,
  source: DefinitionSource,
  pattern: RegExp,
  parseText: (text: string) => ParseResult<T>,
  problems: RegistryProblem[]
): Promise<Candidate<T>[]> => {
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const candidates: Candidate<T>[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const parsed = parseText(await readFile(file, "utf8"));
    const stem = pattern.exec(name)?.[1];
    if (!parsed.ok) {
      problems.push({ path: file, source, errors: parsed.errors });
    } else if (parsed.definition.id !== stem) {
      problems.push({
        path: file,
        source,
        errors: [`The id '${parsed.definition.id}' must match the file name '${name}'`]
      });
    } else {
      candidates.push({ definition: parsed.definition, source, path: file });
    }
  }
  return candidates;
};

/** The winner per id, in id order. `candidates` come in source order, lowest first. */
const resolve = <T extends AgentDefinition | FlowDefinition>(
  candidates: readonly Candidate<T>[]
): RegistryEntry<T>[] => {
  const winners = new Map<string, RegistryEntry<T>>();
  for (const candidate of candidates) {
    const shadowed = winners.get(candidate.definition.id);
    winners.set(candidate.definition.id, {
      ...candidate,
      shadows: shadowed?.source ?? null,
      hash: hashOf(candidate.definition),
      readOnly: candidate.source === "builtin"
    });
  }
  return [...winners.values()].sort((a, b) =>
    a.definition.id < b.definition.id ? -1 : a.definition.id > b.definition.id ? 1 : 0
  );
};

export const loadRegistry = async (input: LoadRegistryInput): Promise<Registry> => {
  const dirs = sourceDirs(input.repoRoot);
  const problems: RegistryProblem[] = [];

  const agentCandidates: Candidate<AgentDefinition>[] = [];
  const flowCandidates: Candidate<FlowDefinition>[] = [];
  for (const source of DEFINITION_SOURCES) {
    for (const candidate of await readDir(
      path.join(dirs[source], "agents"),
      source,
      AGENT_FILE,
      parseAgentFile,
      problems
    )) {
      const errors = validateAgent(candidate.definition, input.installed);
      if (errors.length === 0) agentCandidates.push(candidate);
      else {
        problems.push({
          path: candidate.path,
          source,
          errors: errors.map(({ field, message }) =>
            field === null ? message : `${field}: ${message}`
          )
        });
      }
    }
    flowCandidates.push(
      ...(await readDir(
        path.join(dirs[source], "flows"),
        source,
        FLOW_FILE,
        parseFlowFile,
        problems
      ))
    );
  }

  const agents = resolve(agentCandidates);
  const definitions = agents.map((entry) => entry.definition);
  const validFlows = flowCandidates.filter((candidate) => {
    const errors = validateFlow(candidate.definition, definitions);
    if (errors.length === 0) return true;
    problems.push({
      path: candidate.path,
      source: candidate.source,
      errors: errors.map(({ step, message }) =>
        step === null ? message : `step '${step}': ${message}`
      )
    });
    return false;
  });

  return { agents, flows: resolve(validFlows), problems };
};
