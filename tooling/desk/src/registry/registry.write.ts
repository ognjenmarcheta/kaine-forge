import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";

import { loadRegistry, sourceDirs, type Registry, type RegistryEntry } from "./registry.load";
import { runnableProblems } from "./registry.snapshot";
import {
  DEFINITION_ID_PATTERN,
  validateAgent,
  validateFlow,
  type AgentDefinition,
  type DefinitionKind,
  type DefinitionSource,
  type DefinitionWriteResult,
  type FlowDefinition
} from "../contracts";
import { writeTextAtomic } from "../store/store.atomic";

/**
 * Writes to the agents and flows of a checkout. Saving goes local first
 * (`.ai.local/desk/`, gitignored); promote copies a local definition to the repo (`.desk/`) and
 * removes the local copy. Nothing here commits or stages a file: the owner commits `.desk/` like
 * code. Every write validates first, and nothing is written outside those two directories.
 */

export type Definition =
  | { readonly kind: "agent"; readonly definition: AgentDefinition }
  | { readonly kind: "flow"; readonly definition: FlowDefinition };

/** `ok: false` maps to an error envelope: `detail` is engine text, one problem per line. */
export type DefinitionWriteOutcome =
  | { readonly ok: true; readonly result: DefinitionWriteResult }
  | {
      readonly ok: false;
      readonly code: "invalid-definition" | "definition-refused" | "not-found";
      readonly detail: string;
    };

export interface DefinitionWrites {
  /** Save to local. A local definition with a repo or built-in id overrides it (`shadows`). */
  readonly save: (input: Definition) => Promise<DefinitionWriteOutcome>;
  /** Copy any definition to a new local id. `name` defaults to "<name> (copy)". */
  readonly clone: (
    kind: DefinitionKind,
    from: string,
    to: string,
    name: string | undefined
  ) => Promise<DefinitionWriteOutcome>;
  /** Copy a local definition to the repo and remove the local copy. */
  readonly promote: (
    kind: DefinitionKind,
    id: string,
    confirm: boolean
  ) => Promise<DefinitionWriteOutcome>;
  /** Delete a local definition. An agent that a flow uses stays. */
  readonly remove: (kind: DefinitionKind, id: string) => Promise<DefinitionWriteOutcome>;
}

type Writable = Exclude<DefinitionSource, "builtin">;

const FOLDER: Readonly<Record<DefinitionKind, string>> = { agent: "agents", flow: "flows" };
const EXTENSION: Readonly<Record<DefinitionKind, string>> = { agent: ".md", flow: ".yaml" };

/** The file of `id` in a writable source. The file name is the id, inside that folder only. */
const fileOf = (repoRoot: string, source: Writable, kind: DefinitionKind, id: string): string => {
  const dir = path.resolve(sourceDirs(repoRoot)[source], FOLDER[kind]);
  const file = path.resolve(dir, `${id}${EXTENSION[kind]}`);
  // The routes accept only valid ids. This guard keeps the writer safe without them.
  if (!DEFINITION_ID_PATTERN.test(id) || path.dirname(file) !== dir) {
    throw new Error(`Refusing to write the ${kind} id '${id}' outside ${dir}`);
  }
  return file;
};

/** An agent file: the frontmatter as YAML, then the prompt. `parseAgentFile` reads it back. */
const serialize = (input: Definition): string => {
  if (input.kind === "flow") return stringify(input.definition);
  const { prompt, ...frontmatter } = input.definition;
  return `---\n${stringify(frontmatter)}---\n\n${prompt}\n`;
};

const winners = (
  registry: Registry,
  kind: DefinitionKind
): readonly RegistryEntry<{ readonly id: string }>[] =>
  kind === "agent" ? registry.agents : registry.flows;

const exists = async (file: string): Promise<boolean> => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

const invalid = (problems: readonly string[]): DefinitionWriteOutcome => ({
  ok: false,
  code: "invalid-definition",
  detail: problems.join("\n")
});
const refused = (detail: string): DefinitionWriteOutcome => ({
  ok: false,
  code: "definition-refused",
  detail
});
const notFound = (detail: string): DefinitionWriteOutcome => ({
  ok: false,
  code: "not-found",
  detail
});

/** The problems of a definition, as the registry would report them. */
const problemsOf = (registry: Registry, input: Definition): string[] =>
  input.kind === "agent"
    ? validateAgent(input.definition).map(({ field, message }) =>
        field === null ? message : `${field}: ${message}`
      )
    : [
        ...validateFlow(
          input.definition,
          registry.agents.map((entry) => entry.definition)
        ).map(({ step, message }) => (step === null ? message : `step '${step}': ${message}`)),
        ...runnableProblems(input.definition)
      ];

export interface DefinitionWritesInput {
  readonly repoRoot: string;
}

export const createDefinitionWrites = (input: DefinitionWritesInput): DefinitionWrites => {
  const { repoRoot } = input;
  const load = (): Promise<Registry> => loadRegistry({ repoRoot });

  /** How the id resolves after a write. */
  const resultOf = async (
    kind: DefinitionKind,
    id: string,
    file: string,
    uncommitted: boolean
  ): Promise<DefinitionWriteOutcome> => {
    const entry = winners(await load(), kind).find((candidate) => candidate.definition.id === id);
    return {
      ok: true,
      result: {
        kind,
        id,
        path: file,
        source: entry?.source ?? null,
        shadows: entry?.shadows ?? null,
        uncommitted
      }
    };
  };

  const writeLocal = async (
    registry: Registry,
    write: Definition
  ): Promise<DefinitionWriteOutcome> => {
    const problems = problemsOf(registry, write);
    if (problems.length > 0) return invalid(problems);
    const file = fileOf(repoRoot, "local", write.kind, write.definition.id);
    await writeTextAtomic(file, serialize(write));
    return resultOf(write.kind, write.definition.id, file, false);
  };

  const save: DefinitionWrites["save"] = async (write) => writeLocal(await load(), write);

  const clone: DefinitionWrites["clone"] = async (kind, from, to, name) => {
    const registry = await load();
    const source = winners(registry, kind).find((entry) => entry.definition.id === from);
    if (source === undefined) return notFound(`No ${kind} '${from}'.`);
    // An id is taken by a definition that wins it, or by any file with it, even a broken one.
    const taken =
      winners(registry, kind).find((entry) => entry.definition.id === to)?.source ??
      ((await exists(fileOf(repoRoot, "repo", kind, to)))
        ? "repo"
        : (await exists(fileOf(repoRoot, "local", kind, to)))
          ? "local"
          : null);
    if (taken !== null) {
      return refused(`The ${kind} id '${to}' exists already (${taken}). Pick another id.`);
    }
    const copyName = (original: string): string => name ?? `${original} (copy)`;
    if (kind === "agent") {
      const agent = registry.agents.find((entry) => entry.definition.id === from)?.definition;
      if (agent === undefined) return notFound(`No agent '${from}'.`);
      return writeLocal(registry, {
        kind,
        definition: { ...agent, id: to, name: copyName(agent.name) }
      });
    }
    const flow = registry.flows.find((entry) => entry.definition.id === from)?.definition;
    if (flow === undefined) return notFound(`No flow '${from}'.`);
    return writeLocal(registry, {
      kind,
      definition: { ...flow, id: to, name: copyName(flow.name) }
    });
  };

  const promote: DefinitionWrites["promote"] = async (kind, id, confirm) => {
    const local = fileOf(repoRoot, "local", kind, id);
    let text: string;
    try {
      text = await readFile(local, "utf8");
    } catch {
      return notFound(`No local ${kind} '${id}'. Save it locally first.`);
    }
    const registry = await load();
    // A local file that does not load wins nothing. Only a definition that loads is promoted.
    const entry = winners(registry, kind).find((candidate) => candidate.definition.id === id);
    if (entry?.source !== "local") {
      const problem = registry.problems.find((candidate) => path.resolve(candidate.path) === local);
      return invalid(problem?.errors ?? [`The local ${kind} '${id}' does not load.`]);
    }
    const repo = fileOf(repoRoot, "repo", kind, id);
    if (!confirm && (await exists(repo))) {
      return refused(
        `A repo ${kind} '${id}' exists at ${repo}. Promote again with confirm: true to overwrite it.`
      );
    }
    await writeTextAtomic(repo, text);
    await rm(local);
    return resultOf(kind, id, repo, true);
  };

  const remove: DefinitionWrites["remove"] = async (kind, id) => {
    const local = fileOf(repoRoot, "local", kind, id);
    const registry = await load();
    if (!(await exists(local))) {
      const entry = winners(registry, kind).find((candidate) => candidate.definition.id === id);
      return entry === undefined
        ? notFound(`No ${kind} '${id}'.`)
        : refused(`Only a local ${kind} can be deleted. '${id}' comes from ${entry.source}.`);
    }
    if (kind === "agent") {
      const users = registry.flows.filter((flow) =>
        flow.definition.steps.some((step) => step.kind === "agent" && step.agent === id)
      );
      if (users.length > 0) {
        const names = users.map((flow) => `'${flow.definition.id}' (${flow.source})`).join(", ");
        return refused(`The agent '${id}' is used by the flow ${names}. Change the flow first.`);
      }
    }
    await rm(local);
    return resultOf(kind, id, local, false);
  };

  return { save, clone, promote, remove };
};
