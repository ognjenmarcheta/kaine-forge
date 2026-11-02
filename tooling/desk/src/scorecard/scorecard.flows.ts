import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import type { ScorecardFlow, ScorecardFlowLayout } from "../contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A file through its parser, or `null` when it does not parse. A diagram skips such a file: one
 * broken `package.json` or workflow must not hide the ledger and the other diagrams.
 */
const parseFile = (file: string, parse: (text: string) => unknown): unknown => {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const WORKSPACE_ROOTS = ["apps", "packages", "tooling"] as const;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
] as const;

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly internalDependencies: readonly string[];
}

const readWorkspacePackages = (repoRoot: string): WorkspacePackage[] => {
  const packages: WorkspacePackage[] = [];
  for (const scope of WORKSPACE_ROOTS) {
    const scopeDir = path.join(repoRoot, scope);
    if (!existsSync(scopeDir)) continue;
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      const manifestPath = path.join(scopeDir, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
      const manifest = parseFile(manifestPath, JSON.parse);
      if (!isRecord(manifest) || typeof manifest["name"] !== "string") continue;
      const dependencies = new Set<string>();
      for (const section of DEPENDENCY_SECTIONS) {
        const listed = manifest[section];
        if (!isRecord(listed)) continue;
        for (const name of Object.keys(listed)) {
          if (name.startsWith("@repo/")) dependencies.add(name);
        }
      }
      packages.push({
        name: manifest["name"],
        dir: `${scope}/${entry.name}`,
        internalDependencies: [...dependencies]
      });
    }
  }
  return packages.sort((left, right) => left.dir.localeCompare(right.dir));
};

const workspaceFlow = (packages: readonly WorkspacePackage[]): ScorecardFlow => {
  const known = new Set(packages.map((entry) => entry.name));
  return {
    id: "workspace-graph",
    title: "Workspace dependency graph",
    caption: `Backs dimension 1. Derived from every package.json in the workspace: ${packages.length} workspaces, edges point from a dependency to its dependent.`,
    nodes: packages.map((entry) => ({
      id: entry.name,
      label: entry.name.replace(/^@repo\//, ""),
      group: entry.dir.split("/")[0] ?? "packages"
    })),
    edges: packages.flatMap((entry) =>
      entry.internalDependencies
        .filter((dependency) => known.has(dependency))
        .map((dependency) => ({ from: dependency, to: entry.name }))
    )
  };
};

interface WorkflowJob {
  readonly id: string;
  readonly label: string;
  readonly workflow: string;
  readonly needs: readonly string[];
}

const asStringList = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string");
  return [];
};

/** Every job of `.github/workflows`, with its `needs` as job ids. A file without jobs adds none. */
export const readWorkflowJobs = (workflowsDir: string): WorkflowJob[] => {
  if (!existsSync(workflowsDir)) return [];
  const files = readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));
  const jobs: WorkflowJob[] = [];
  for (const file of files) {
    const parsed = parseFile(path.join(workflowsDir, file), parseYaml);
    if (!isRecord(parsed) || !isRecord(parsed["jobs"])) continue;
    const workflow = typeof parsed["name"] === "string" ? parsed["name"] : file;
    for (const [jobKey, job] of Object.entries(parsed["jobs"])) {
      jobs.push({
        id: `${file}:${jobKey}`,
        label: isRecord(job) && typeof job["name"] === "string" ? job["name"] : jobKey,
        workflow,
        needs: isRecord(job) ? asStringList(job["needs"]).map((need) => `${file}:${need}`) : []
      });
    }
  }
  return jobs;
};

const ciFlow = (jobs: readonly WorkflowJob[]): ScorecardFlow => {
  const known = new Set(jobs.map((job) => job.id));
  const workflows = new Set(jobs.map((job) => job.workflow));
  return {
    id: "ci-topology",
    title: "CI job topology",
    caption: `Backs dimension 3. Derived from .github/workflows: ${jobs.length} jobs across ${workflows.size} workflows, edges follow each job's needs.`,
    nodes: jobs.map((job) => ({ id: job.id, label: job.label, group: job.workflow })),
    edges: jobs.flatMap((job) =>
      job.needs.filter((need) => known.has(need)).map((need) => ({ from: need, to: job.id }))
    )
  };
};

/** The diagrams the desk derives from the checkout now: workspaces (dimension 1) and CI (3). */
export const derivedFlows = (repoRoot: string): ScorecardFlow[] => [
  workspaceFlow(readWorkspacePackages(repoRoot)),
  ciFlow(readWorkflowJobs(path.join(repoRoot, ".github", "workflows")))
];

const NODE_WIDTH = 168;
const LINE_HEIGHT = 15;
const NODE_PADDING = 11;
const COLUMN_GAP = 78;
const ROW_GAP = 18;
const MARGIN = 24;

const assignLayers = (flow: ScorecardFlow): Map<string, number> => {
  const layers = new Map<string, number>(flow.nodes.map((node) => [node.id, 0]));
  // Longest-path layering, bounded by node count so a cyclic graph terminates
  // instead of spinning; the workspace and CI graphs are acyclic in practice.
  for (let pass = 0; pass < flow.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of flow.edges) {
      const fromLayer = layers.get(edge.from);
      const toLayer = layers.get(edge.to);
      if (fromLayer === undefined || toLayer === undefined) continue;
      if (toLayer < fromLayer + 1) {
        layers.set(edge.to, fromLayer + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layers;
};

/**
 * Places each node one column right of its deepest dependency, columns centered on the tallest.
 * A label line break makes the node taller.
 */
export const layoutFlow = (flow: ScorecardFlow): ScorecardFlowLayout => {
  const layers = assignLayers(flow);
  const columns = new Map<number, ScorecardFlow["nodes"]>();
  for (const node of flow.nodes) {
    const layer = layers.get(node.id) ?? 0;
    columns.set(layer, [...(columns.get(layer) ?? []), node]);
  }

  const heightOf = (label: string): number =>
    label.split("\n").length * LINE_HEIGHT + NODE_PADDING * 2;
  const columnHeights = new Map<number, number>();
  for (const [layer, nodes] of columns) {
    columnHeights.set(
      layer,
      nodes.reduce((sum, node) => sum + heightOf(node.label) + ROW_GAP, -ROW_GAP)
    );
  }

  const tallest = Math.max(0, ...columnHeights.values());
  const sortedLayers = [...columns.keys()].sort((left, right) => left - right);
  const nodes: ScorecardFlowLayout["nodes"] = [];
  for (const [index, layer] of sortedLayers.entries()) {
    const column = [...(columns.get(layer) ?? [])].sort(
      (left, right) =>
        (left.group ?? "").localeCompare(right.group ?? "") || left.id.localeCompare(right.id)
    );
    let cursor = MARGIN + (tallest - (columnHeights.get(layer) ?? 0)) / 2;
    for (const node of column) {
      const height = heightOf(node.label);
      nodes.push({
        id: node.id,
        label: node.label,
        group: node.group ?? "default",
        x: MARGIN + index * (NODE_WIDTH + COLUMN_GAP),
        y: cursor,
        width: NODE_WIDTH,
        height
      });
      cursor += height + ROW_GAP;
    }
  }

  return {
    id: flow.id,
    title: flow.title,
    caption: flow.caption,
    nodes,
    edges: flow.edges.map((edge) =>
      edge.label === undefined
        ? { from: edge.from, to: edge.to }
        : { from: edge.from, to: edge.to, label: edge.label }
    ),
    width: MARGIN * 2 + Math.max(1, sortedLayers.length) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP,
    height: MARGIN * 2 + tallest
  };
};
