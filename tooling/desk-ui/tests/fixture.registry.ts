import type { DeskRuntime } from "@repo/desk";
import {
  validateAgent,
  validateFlow,
  type AgentDefinition,
  type AgentView,
  type DefinitionKind,
  type DefinitionSource,
  type FlowSnapshot,
  type FlowView
} from "@repo/desk/contracts";
import { createHash } from "node:crypto";

import { registryAgents, registryFlows, resolvedOf, type BySource } from "./fixture.data";

/**
 * The agents and flows of the fixture desk, in memory: the real routes over a registry of three
 * sources, with the real validation of `@repo/desk/contracts`. The file rules of the engine (YAML,
 * paths, promote on disk) have their tests in `@repo/desk`; this keeps the HTTP shape and the
 * source rules a page sees, so a browser test can save, clone, promote, delete, and start.
 */

type DefinitionWrites = NonNullable<DeskRuntime["definitionWrites"]>;
type DefinitionViews = Awaited<ReturnType<NonNullable<DeskRuntime["readDefinitions"]>>>;
type WriteOutcome = Awaited<ReturnType<DefinitionWrites["save"]>>;

/** Lowest first: a later source wins an id. */
const SOURCES: readonly DefinitionSource[] = ["builtin", "repo", "local"];

const hashOf = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface Store<T extends { readonly id: string }> {
  readonly entries: Record<DefinitionSource, Map<string, T>>;
}

const storeOf = <T extends { readonly id: string }>(seed: BySource<T>): Store<T> => ({
  entries: {
    builtin: new Map(seed.builtin.map((entry) => [entry.id, entry])),
    repo: new Map(seed.repo.map((entry) => [entry.id, entry])),
    local: new Map(seed.local.map((entry) => [entry.id, entry]))
  }
});

interface Winner<T> {
  readonly definition: T;
  readonly source: DefinitionSource;
  readonly shadows: DefinitionSource | null;
}

/** Each id once, from the highest source that has it, with the next lower source it overrides. */
const winners = <T extends { readonly id: string }>(store: Store<T>): Winner<T>[] => {
  const ids = [...new Set(SOURCES.flatMap((source) => [...store.entries[source].keys()]))];
  return ids.flatMap((id) => {
    const holders = SOURCES.filter((source) => store.entries[source].has(id));
    const source = holders.at(-1);
    const definition = source === undefined ? undefined : store.entries[source].get(id);
    if (source === undefined || definition === undefined) return [];
    return [{ definition, source, shadows: holders.at(-2) ?? null }];
  });
};

const winnerOf = <T extends { readonly id: string }>(
  store: Store<T>,
  id: string
): Winner<T> | undefined => winners(store).find((entry) => entry.definition.id === id);

export interface FixtureRegistry {
  readonly read: () => Promise<DefinitionViews>;
  readonly writes: DefinitionWrites;
  /** The snapshot an issue started on `flowId` runs on, or `null` for an unknown flow. */
  readonly snapshotOf: (flowId: string) => FlowSnapshot | null;
}

export function createFixtureRegistry(): FixtureRegistry {
  const agents = storeOf(registryAgents());
  const flows = storeOf(registryFlows());
  const agentList = (): AgentDefinition[] => winners(agents).map((entry) => entry.definition);

  const read = (): Promise<DefinitionViews> =>
    Promise.resolve({
      agents: {
        agents: winners(agents).map((entry): AgentView => ({
          definition: entry.definition,
          source: entry.source,
          shadows: entry.shadows,
          readOnly: entry.source === "builtin",
          hash: hashOf(entry.definition),
          problems: [],
          resolved: resolvedOf(entry.definition)
        })),
        problems: []
      },
      flows: {
        flows: winners(flows).map((entry): FlowView => ({
          definition: entry.definition,
          source: entry.source,
          shadows: entry.shadows,
          readOnly: entry.source === "builtin",
          hash: hashOf(entry.definition),
          problems: []
        })),
        problems: []
      }
    });

  const pathOf = (kind: DefinitionKind, source: DefinitionSource, id: string): string =>
    source === "local"
      ? `/fixture/.ai.local/desk/${kind}s/${id}${kind === "agent" ? ".md" : ".yaml"}`
      : `/fixture/.desk/${kind}s/${id}${kind === "agent" ? ".md" : ".yaml"}`;

  const done = (
    kind: DefinitionKind,
    id: string,
    path: string,
    uncommitted = false
  ): Promise<WriteOutcome> => {
    const winner = kind === "agent" ? winnerOf(agents, id) : winnerOf(flows, id);
    return Promise.resolve({
      ok: true,
      result: {
        kind,
        id,
        path,
        source: winner?.source ?? null,
        shadows: winner?.shadows ?? null,
        uncommitted
      }
    });
  };
  const refused = (
    code: "invalid-definition" | "definition-refused" | "not-found",
    detail: string
  ): Promise<WriteOutcome> => Promise.resolve({ ok: false, code, detail });

  /** A local copy of `from` under the id `to`, in the store of its kind. */
  const cloneIn = <T extends { readonly id: string; readonly name: string }>(
    kind: DefinitionKind,
    store: Store<T>,
    from: string,
    to: string,
    name: string | undefined
  ): Promise<WriteOutcome> => {
    const source = winnerOf(store, from)?.definition;
    if (source === undefined) return refused("not-found", `No ${kind} '${from}'.`);
    if (winnerOf(store, to) !== undefined) {
      return refused("definition-refused", `The id '${to}' is taken.`);
    }
    store.entries.local.set(to, { ...source, id: to, name: name ?? `${source.name} (copy)` });
    return done(kind, to, pathOf(kind, "local", to));
  };

  /** Move a local definition to the repository. A repo file of the same id needs `confirm`. */
  const promoteIn = <T extends { readonly id: string }>(
    kind: DefinitionKind,
    store: Store<T>,
    id: string,
    confirm: boolean
  ): Promise<WriteOutcome> => {
    const local = store.entries.local.get(id);
    if (local === undefined) return refused("not-found", `No local ${kind} '${id}'.`);
    if (store.entries.repo.has(id) && !confirm) {
      return refused("definition-refused", `The repository has the ${kind} '${id}'.`);
    }
    store.entries.repo.set(id, local);
    store.entries.local.delete(id);
    return done(kind, id, pathOf(kind, "repo", id), true);
  };

  /** Delete a local definition. An agent that a flow uses stays. */
  const removeIn = <T extends { readonly id: string }>(
    kind: DefinitionKind,
    store: Store<T>,
    id: string
  ): Promise<WriteOutcome> => {
    if (!store.entries.local.has(id)) {
      return winnerOf(store, id) === undefined
        ? refused("not-found", `No ${kind} '${id}'.`)
        : refused("definition-refused", `The ${kind} '${id}' is not local.`);
    }
    const users = winners(flows)
      .filter(({ definition }) =>
        definition.steps.some((step) => step.kind === "agent" && step.agent === id)
      )
      .map(({ definition }) => definition.id);
    if (kind === "agent" && users.length > 0) {
      return refused("definition-refused", `The flows ${users.join(", ")} use '${id}'.`);
    }
    store.entries.local.delete(id);
    return done(kind, id, pathOf(kind, "local", id));
  };

  const writes: DefinitionWrites = {
    save: (input) => {
      const problems =
        input.kind === "agent"
          ? validateAgent(input.definition).map((error) => error.message)
          : validateFlow(input.definition, agentList()).map((error) => error.message);
      if (problems.length > 0) return refused("invalid-definition", problems.join("\n"));
      if (input.kind === "agent") {
        agents.entries.local.set(input.definition.id, input.definition);
      } else {
        flows.entries.local.set(input.definition.id, input.definition);
      }
      return done(
        input.kind,
        input.definition.id,
        pathOf(input.kind, "local", input.definition.id)
      );
    },
    clone: (kind, from, to, name) =>
      kind === "agent"
        ? cloneIn(kind, agents, from, to, name)
        : cloneIn(kind, flows, from, to, name),
    promote: (kind, id, confirm) =>
      kind === "agent" ? promoteIn(kind, agents, id, confirm) : promoteIn(kind, flows, id, confirm),
    remove: (kind, id) =>
      kind === "agent" ? removeIn(kind, agents, id) : removeIn(kind, flows, id)
  };

  const snapshotOf = (flowId: string): FlowSnapshot | null => {
    const winner = winnerOf(flows, flowId);
    if (winner === undefined) return null;
    const flow = winner.definition;
    const named = new Set(
      flow.steps.flatMap((step) => (step.kind === "agent" ? [step.agent] : []))
    );
    const used = agentList().filter((agent) => named.has(agent.id));
    return { flow, agents: used, hash: hashOf({ flow, used }), flowSource: winner.source };
  };

  return { read, writes, snapshotOf };
}
