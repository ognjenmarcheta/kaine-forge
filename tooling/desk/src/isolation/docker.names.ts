import { createHash } from "node:crypto";
import path from "node:path";

import type { Provider } from "../contracts";

/**
 * Every Docker resource the desk creates carries the label `kaine-desk=1` and a
 * name that starts with `kaine-desk-`. Cleanup finds resources by label and
 * checks the name prefix again before it removes anything, so a volume or
 * container of another tool is never touched.
 */

export const DESK_LABEL = "kaine-desk";
export const LABEL_REPO = "kaine-desk.repo";
export const LABEL_ISSUE = "kaine-desk.issue";
export const LABEL_RUN = "kaine-desk.run";
export const LABEL_KIND = "kaine-desk.kind";
export const NAME_PREFIX = "kaine-desk-";

export const isDeskName = (name: string): boolean =>
  name.startsWith(NAME_PREFIX) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name);

/** Which repository a resource belongs to: the folder name plus a short hash of the full path. */
export const repoKeyFor = (repoRoot: string): string => {
  const slug =
    path
      .basename(repoRoot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "repo";
  return `${slug}-${createHash("sha256").update(path.resolve(repoRoot)).digest("hex").slice(0, 6)}`;
};

export interface ResourceScope {
  readonly repoKey: string;
  readonly issue: number;
}

const assertScope = (scope: ResourceScope): void => {
  if (!Number.isSafeInteger(scope.issue) || scope.issue <= 0) {
    throw new RangeError(`Issue number must be a positive integer, got ${scope.issue}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(scope.repoKey)) {
    throw new RangeError(`Invalid repository key '${scope.repoKey}'`);
  }
};

/** Per-issue volumes: `kaine-desk-<repo>-<issue>-ws|state|store`. */
export const issueVolume = (scope: ResourceScope, kind: "ws" | "state" | "store"): string => {
  assertScope(scope);
  return `${NAME_PREFIX}${scope.repoKey}-${scope.issue}-${kind}`;
};

/** The scope of a resource: one issue, or `null` for a machine-wide step such as `login`. */
export type Owner = ResourceScope | null;

const ownerPart = (owner: Owner): string => {
  if (owner === null) return "machine";
  assertScope(owner);
  return `${owner.repoKey}-${owner.issue}`;
};

const assertRunId = (runId: string): string => {
  if (!/^[a-f0-9]{8,32}$/.test(runId)) throw new RangeError(`Invalid run id '${runId}'`);
  return runId;
};

/** The proxy socket volume of one run. It is removed when the run ends. */
export const socketVolume = (owner: Owner, runId: string): string =>
  `${NAME_PREFIX}${ownerPart(owner)}-${assertRunId(runId)}-sock`;

/** One login per provider, shared by all issues of the machine: `kaine-desk-auth-claude`. */
export const authVolume = (provider: Provider): string => `${NAME_PREFIX}auth-${provider}`;

export const containerName = (owner: Owner, kind: string, runId: string): string => {
  if (!/^[a-z-]+$/.test(kind)) throw new RangeError(`Invalid container kind '${kind}'`);
  return `${NAME_PREFIX}${ownerPart(owner)}-${kind}-${assertRunId(runId)}`;
};

export const resourceLabels = (
  scope: Owner,
  kind: string,
  runId?: string
): Record<string, string> => {
  if (scope !== null) assertScope(scope);
  return {
    [DESK_LABEL]: "1",
    ...(scope === null ? {} : { [LABEL_REPO]: scope.repoKey, [LABEL_ISSUE]: String(scope.issue) }),
    ...(runId === undefined ? {} : { [LABEL_RUN]: assertRunId(runId) }),
    [LABEL_KIND]: kind
  };
};

/** `--filter` arguments that select the resources of one issue. */
export const issueFilters = (scope: ResourceScope): string[] => {
  assertScope(scope);
  return [
    `label=${DESK_LABEL}=1`,
    `label=${LABEL_REPO}=${scope.repoKey}`,
    `label=${LABEL_ISSUE}=${scope.issue}`
  ];
};

/** `--filter` arguments that select every desk resource. */
export const allFilters = (): string[] => [`label=${DESK_LABEL}=1`];

export const runFilter = (runId: string): string => `label=${LABEL_RUN}=${assertRunId(runId)}`;
