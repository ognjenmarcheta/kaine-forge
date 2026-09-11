import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { REPO_ROOT } from "./ai.util";
import { discoverWorkspacePackages, type WorkspacePackage } from "./release.util";

export const LEDGER_PATH = join(REPO_ROOT, "docs", "agents", "monorepo-scorecard.md");
export const OUT_DIR = join(REPO_ROOT, "scorecard-out");
export const DATA_MARKER = "scorecard:data";
export const GENERATED_MARKER = "scorecard:generated";

export const DIMENSIONS = [
  "Workspace & Boundaries",
  "Build & Cache",
  "CI Topology & Speed",
  "Testing & Coverage",
  "Dependency Hygiene",
  "Release & Deploy",
  "Security Posture",
  "DX & Onboarding",
  "Docs & Agent Scaffolding",
  "AI & Agent Quality"
] as const;

const DISPOSITIONS = ["open", "fixed", "wontfix", "observed", "regression"] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

export interface DimensionScore {
  score: number | null;
  evidence: string;
  calibration?: string | undefined;
}

export interface ScorecardFinding {
  slug: string;
  title: string;
  dimension: number;
  ladderRank: number;
  disposition: Disposition;
  issue?: number | undefined;
  reason?: string | undefined;
}

export interface ScorecardRun {
  date: string;
  commit: string;
  mode: "fan-out" | "sequential";
  agent: string;
  overall: number;
  dimensions: Record<string, DimensionScore>;
  findings: ScorecardFinding[];
}

export interface FlowNode {
  id: string;
  label: string;
  group?: string | undefined;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string | undefined;
}

export interface Flow {
  id: string;
  title: string;
  caption: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface LedgerData {
  schema: number;
  runs: ScorecardRun[];
  authoredFlows: Flow[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDisposition = (value: string): value is Disposition =>
  DISPOSITIONS.some((disposition) => disposition === value);

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${path}: expected a string`);
  }
  return value;
};

const requireNumber = (value: unknown, path: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${path}: expected a number`);
  }
  return value;
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: expected an array`);
  }
  return value;
};

const markerRegion = (marker: string): RegExp =>
  new RegExp(`(<!--\\s*${marker}:start\\s*-->)([\\s\\S]*?)(<!--\\s*${marker}:end\\s*-->)`);

export const extractRegion = (raw: string, marker: string): string => {
  const match = markerRegion(marker).exec(raw);
  if (!match) {
    throw new Error(`Ledger is missing the ${marker} marker pair`);
  }
  return match[2] ?? "";
};

export const replaceRegion = (raw: string, marker: string, body: string): string => {
  const pattern = markerRegion(marker);
  if (!pattern.test(raw)) {
    throw new Error(`Ledger is missing the ${marker} marker pair`);
  }
  return raw.replace(pattern, (_full, start: string, _body: string, end: string) =>
    [start, "", body.trim(), "", end].join("\n")
  );
};

const parseFlow = (value: unknown, path: string): Flow => {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object`);
  }

  return {
    id: requireString(value.id, `${path}.id`),
    title: requireString(value.title, `${path}.title`),
    caption: requireString(value.caption, `${path}.caption`),
    nodes: requireArray(value.nodes, `${path}.nodes`).map((node, index) => {
      if (!isRecord(node)) {
        throw new Error(`${path}.nodes[${index}]: expected an object`);
      }
      return {
        id: requireString(node.id, `${path}.nodes[${index}].id`),
        label: requireString(node.label, `${path}.nodes[${index}].label`),
        group: typeof node.group === "string" ? node.group : undefined
      };
    }),
    edges: requireArray(value.edges, `${path}.edges`).map((edge, index) => {
      if (!isRecord(edge)) {
        throw new Error(`${path}.edges[${index}]: expected an object`);
      }
      return {
        from: requireString(edge.from, `${path}.edges[${index}].from`),
        to: requireString(edge.to, `${path}.edges[${index}].to`),
        label: typeof edge.label === "string" ? edge.label : undefined
      };
    })
  };
};

const parseRun = (value: unknown, path: string): ScorecardRun => {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected an object`);
  }

  const mode = requireString(value.mode, `${path}.mode`);
  if (mode !== "fan-out" && mode !== "sequential") {
    throw new Error(`${path}.mode: expected "fan-out" or "sequential"`);
  }

  const dimensionsValue = value.dimensions;
  if (!isRecord(dimensionsValue)) {
    throw new Error(`${path}.dimensions: expected an object`);
  }

  const dimensions: Record<string, DimensionScore> = {};
  for (const [key, entry] of Object.entries(dimensionsValue)) {
    if (!isRecord(entry)) {
      throw new Error(`${path}.dimensions.${key}: expected an object`);
    }
    dimensions[key] = {
      score:
        entry.score === null ? null : requireNumber(entry.score, `${path}.dimensions.${key}.score`),
      evidence: requireString(entry.evidence, `${path}.dimensions.${key}.evidence`),
      calibration: typeof entry.calibration === "string" ? entry.calibration : undefined
    };
  }

  return {
    date: requireString(value.date, `${path}.date`),
    commit: requireString(value.commit, `${path}.commit`),
    mode,
    agent: requireString(value.agent, `${path}.agent`),
    overall: requireNumber(value.overall, `${path}.overall`),
    dimensions,
    findings: requireArray(value.findings, `${path}.findings`).map((finding, index) => {
      if (!isRecord(finding)) {
        throw new Error(`${path}.findings[${index}]: expected an object`);
      }
      const disposition = requireString(
        finding.disposition,
        `${path}.findings[${index}].disposition`
      );
      if (!isDisposition(disposition)) {
        throw new Error(
          `${path}.findings[${index}].disposition: unknown disposition '${disposition}'`
        );
      }
      return {
        slug: requireString(finding.slug, `${path}.findings[${index}].slug`),
        title: requireString(finding.title, `${path}.findings[${index}].title`),
        dimension: requireNumber(finding.dimension, `${path}.findings[${index}].dimension`),
        ladderRank: requireNumber(finding.ladderRank, `${path}.findings[${index}].ladderRank`),
        disposition,
        issue: typeof finding.issue === "number" ? finding.issue : undefined,
        reason: typeof finding.reason === "string" ? finding.reason : undefined
      };
    })
  };
};

export const parseLedger = (raw: string): LedgerData => {
  const region = extractRegion(raw, DATA_MARKER);
  const fence = /```json\s*([\s\S]*?)```/.exec(region);
  if (!fence) {
    throw new Error(`Ledger ${DATA_MARKER} region has no \`\`\`json block`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fence[1] ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Ledger ${DATA_MARKER} JSON is invalid: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Ledger ${DATA_MARKER} JSON must be an object`);
  }

  return {
    schema: requireNumber(parsed.schema, "schema"),
    runs: requireArray(parsed.runs, "runs").map((run, index) => parseRun(run, `runs[${index}]`)),
    authoredFlows: requireArray(parsed.authoredFlows, "authoredFlows").map((flow, index) =>
      parseFlow(flow, `authoredFlows[${index}]`)
    )
  };
};

export const deriveWorkspaceFlow = (packages: WorkspacePackage[]): Flow => {
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
  id: string;
  label: string;
  workflow: string;
  needs: string[];
}

const asStringList = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
};

export const readWorkflowJobs = (workflowsDir: string): WorkflowJob[] => {
  if (!existsSync(workflowsDir)) {
    return [];
  }

  const jobs: WorkflowJob[] = [];
  const files = readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const parsed: unknown = parseYaml(readFileSync(join(workflowsDir, file), "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.jobs)) {
      continue;
    }

    const workflow = typeof parsed.name === "string" ? parsed.name : file;
    for (const [jobKey, jobValue] of Object.entries(parsed.jobs)) {
      const label =
        isRecord(jobValue) && typeof jobValue.name === "string" ? jobValue.name : jobKey;
      jobs.push({
        id: `${file}:${jobKey}`,
        label,
        workflow,
        needs: isRecord(jobValue)
          ? asStringList(jobValue.needs).map((need) => `${file}:${need}`)
          : []
      });
    }
  }

  return jobs;
};

export const deriveCiFlow = (jobs: WorkflowJob[]): Flow => {
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

export const derivedFlows = (rootDir = REPO_ROOT): Flow[] => [
  deriveWorkspaceFlow(discoverWorkspacePackages(rootDir)),
  deriveCiFlow(readWorkflowJobs(join(rootDir, ".github", "workflows")))
];

const NODE_WIDTH = 168;
const LINE_HEIGHT = 15;
const NODE_PADDING = 11;
const COLUMN_GAP = 78;
const ROW_GAP = 18;
const MARGIN = 24;

export interface LaidOutNode {
  id: string;
  lines: string[];
  group: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowLayout {
  nodes: LaidOutNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}

const assignLayers = (flow: Flow): Map<string, number> => {
  const layers = new Map<string, number>(flow.nodes.map((node) => [node.id, 0]));

  // Longest-path layering, bounded by node count so a cyclic graph terminates
  // instead of spinning; the workspace and CI graphs are acyclic in practice.
  for (let pass = 0; pass < flow.nodes.length; pass += 1) {
    let changed = false;
    for (const edge of flow.edges) {
      const fromLayer = layers.get(edge.from);
      const toLayer = layers.get(edge.to);
      if (fromLayer === undefined || toLayer === undefined) {
        continue;
      }
      if (toLayer < fromLayer + 1) {
        layers.set(edge.to, fromLayer + 1);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  return layers;
};

export const layoutFlow = (flow: Flow): FlowLayout => {
  const layers = assignLayers(flow);
  const columns = new Map<number, FlowNode[]>();

  for (const node of flow.nodes) {
    const layer = layers.get(node.id) ?? 0;
    const column = columns.get(layer) ?? [];
    column.push(node);
    columns.set(layer, column);
  }

  const heightOf = (node: FlowNode): number =>
    node.label.split("\n").length * LINE_HEIGHT + NODE_PADDING * 2;

  const columnHeights = new Map<number, number>();
  for (const [layer, nodes] of columns) {
    const total = nodes.reduce((sum, node) => sum + heightOf(node) + ROW_GAP, -ROW_GAP);
    columnHeights.set(layer, total);
  }

  const tallest = Math.max(0, ...columnHeights.values());
  const laidOut: LaidOutNode[] = [];
  const sortedLayers = [...columns.keys()].sort((left, right) => left - right);

  for (const [index, layer] of sortedLayers.entries()) {
    const nodes = (columns.get(layer) ?? []).sort(
      (left, right) =>
        (left.group ?? "").localeCompare(right.group ?? "") || left.id.localeCompare(right.id)
    );
    let cursor = MARGIN + (tallest - (columnHeights.get(layer) ?? 0)) / 2;

    for (const node of nodes) {
      const height = heightOf(node);
      laidOut.push({
        id: node.id,
        lines: node.label.split("\n"),
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
    nodes: laidOut,
    edges: flow.edges,
    width: MARGIN * 2 + Math.max(1, sortedLayers.length) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP,
    height: MARGIN * 2 + tallest
  };
};

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const groupPalette = (groups: string[]): Map<string, number> =>
  new Map(
    [...new Set(groups)]
      .sort((left, right) => left.localeCompare(right))
      .map((group, index) => [group, index % 6])
  );

export const renderFlowSvg = (flow: Flow): string => {
  const layout = layoutFlow(flow);
  const palette = groupPalette(layout.nodes.map((node) => node.group));
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));

  const edges = layout.edges
    .map((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) {
        return "";
      }
      const startX = from.x + from.width;
      const startY = from.y + from.height / 2;
      const endX = to.x;
      const endY = to.y + to.height / 2;
      const control = Math.max(24, (endX - startX) / 2);
      const path = `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`;
      const label = edge.label
        ? `<text class="edge-label" x="${(startX + endX) / 2}" y="${(startY + endY) / 2 - 5}">${escapeHtml(edge.label)}</text>`
        : "";
      return `<path class="edge" d="${path}" marker-end="url(#arrow-${flow.id})" />${label}`;
    })
    .join("\n      ");

  const nodes = layout.nodes
    .map((node) => {
      const tone = palette.get(node.group) ?? 0;
      const text = node.lines
        .map(
          (line, index) =>
            `<tspan x="${node.x + node.width / 2}" dy="${index === 0 ? 0 : LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
        )
        .join("");
      return [
        `<g class="node tone-${tone}">`,
        `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="7" />`,
        `<text x="${node.x + node.width / 2}" y="${node.y + NODE_PADDING + 11}">${text}</text>`,
        `</g>`
      ].join("");
    })
    .join("\n      ");

  return [
    `<svg class="flow" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${escapeHtml(flow.title)}">`,
    `      <defs><marker id="arrow-${flow.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`,
    `      ${edges}`,
    `      ${nodes}`,
    `</svg>`
  ].join("\n");
};

export const GENERATED_NOTICE = "GENERATED REGION. Written by pnpm scorecard. Do not edit by hand.";

const bar = (score: number | null, width = 10): string => {
  if (score === null) {
    return "—".repeat(width);
  }
  const filled = Math.round((Math.max(0, Math.min(10, score)) / 10) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

const delta = (current: number | null, previous: number | null): string => {
  if (current === null || previous === null) {
    return "—";
  }
  const difference = Number((current - previous).toFixed(1));
  if (difference === 0) {
    return "0";
  }
  return difference > 0 ? `▲+${difference}` : `▼${difference}`;
};

export const renderLedgerMarkdown = (data: LedgerData): string => {
  if (data.runs.length === 0) {
    return "_No runs recorded yet. Run the `kaine-scorecard` skill, then `pnpm scorecard`._";
  }

  const runs = [...data.runs].sort((left, right) => left.date.localeCompare(right.date));
  const latest = runs[runs.length - 1];
  const previous = runs.length > 1 ? runs[runs.length - 2] : undefined;
  if (!latest) {
    return "_No runs recorded yet._";
  }

  const history = [
    "### Run history",
    "",
    "| Date | Commit | Mode | Agent | Overall | Dims | Findings filed |",
    "| ---- | ------ | ---- | ----- | ------- | ---- | -------------- |",
    ...runs
      .slice()
      .reverse()
      .map((run) => {
        const filed = run.findings.filter((finding) => typeof finding.issue === "number").length;
        const scored = Object.values(run.dimensions).filter(
          (dimension) => dimension.score !== null
        ).length;
        return `| ${run.date} | \`${run.commit.slice(0, 7)}\` | ${run.mode} | ${run.agent} | **${run.overall}** | ${scored} | ${filed} |`;
      })
  ];

  const scores = [
    `### Latest scorecard — ${latest.date} (\`${latest.commit.slice(0, 7)}\`, ${latest.mode})`,
    "",
    "| # | Dimension | Score | | Δ | Evidence |",
    "| - | --------- | ----- | - | - | -------- |",
    ...DIMENSIONS.map((name, index) => {
      const key = String(index + 1);
      const current = latest.dimensions[key];
      const before = previous?.dimensions[key];
      const score = current?.score ?? null;
      const display = score === null ? "unscored" : score.toFixed(1);
      return `| ${index + 1} | ${name} | ${display} | \`${bar(score)}\` | ${delta(score, before?.score ?? null)} | ${current?.evidence ?? "—"} |`;
    }),
    "",
    `**Overall: ${latest.overall}**${previous ? ` (${delta(latest.overall, previous.overall)})` : ""}`
  ];

  const findings =
    latest.findings.length === 0
      ? ["### Findings", "", "_None recorded for this run._"]
      : [
          "### Findings",
          "",
          "| Slug | Dimension | Ladder | Disposition | Issue | Title |",
          "| ---- | --------- | ------ | ----------- | ----- | ----- |",
          ...[...latest.findings]
            .sort((left, right) => left.ladderRank - right.ladderRank)
            .map(
              (finding) =>
                `| \`${finding.slug}\` | ${finding.dimension} | ${finding.ladderRank} | ${finding.disposition} | ${finding.issue ? `#${finding.issue}` : "—"} | ${finding.title} |`
            )
        ];

  return [`<!-- ${GENERATED_NOTICE} -->`, "", ...history, "", ...scores, "", ...findings].join(
    "\n"
  );
};

const dimensionCards = (
  latest: ScorecardRun | undefined,
  previous: ScorecardRun | undefined
): string => {
  if (!latest) {
    return `<p class="empty">No runs recorded yet. Run the <code>kaine-scorecard</code> skill, then <code>pnpm scorecard</code>.</p>`;
  }

  return DIMENSIONS.map((name, index) => {
    const key = String(index + 1);
    const current = latest.dimensions[key];
    const score = current?.score ?? null;
    const before = previous?.dimensions[key]?.score ?? null;
    const percent = score === null ? 0 : Math.max(0, Math.min(10, score)) * 10;
    const band =
      score === null
        ? "unscored"
        : score >= 9
          ? "top"
          : score >= 7
            ? "good"
            : score >= 5
              ? "fair"
              : score >= 3
                ? "weak"
                : "bad";
    return [
      `<article class="card band-${band}">`,
      `<header><span class="idx">${index + 1}</span><h3>${escapeHtml(name)}</h3></header>`,
      `<p class="score">${score === null ? "—" : score.toFixed(1)}<span class="delta">${escapeHtml(delta(score, before))}</span></p>`,
      `<div class="gauge"><i style="width:${percent}%"></i></div>`,
      `<p class="evidence">${escapeHtml(current?.evidence ?? "No evidence recorded.")}</p>`,
      current?.calibration ? `<p class="calibration">${escapeHtml(current.calibration)}</p>` : "",
      `</article>`
    ].join("");
  }).join("\n      ");
};

const trendSvg = (runs: ScorecardRun[]): string => {
  if (runs.length < 2) {
    return "";
  }

  const width = 640;
  const height = 160;
  const padding = 28;
  const points = runs.map((run, index) => {
    const x = padding + (index / (runs.length - 1)) * (width - padding * 2);
    const y =
      height - padding - (Math.max(0, Math.min(10, run.overall)) / 10) * (height - padding * 2);
    return { x, y, run };
  });

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const dots = points
    .map(
      (point) =>
        `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${escapeHtml(`${point.run.date}: ${point.run.overall}`)}</title></circle>`
    )
    .join("");

  return [
    `<section class="panel">`,
    `<h2>Overall trend</h2>`,
    `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Overall score across runs">`,
    `<path class="trend-line" d="${line}" />${dots}`,
    `</svg>`,
    `</section>`
  ].join("\n      ");
};

const findingsTable = (latest: ScorecardRun | undefined): string => {
  if (!latest || latest.findings.length === 0) {
    return `<section class="panel"><h2>Findings</h2><p class="empty">No findings recorded.</p></section>`;
  }

  const rows = [...latest.findings]
    .sort((left, right) => left.ladderRank - right.ladderRank)
    .map(
      (finding) =>
        `<tr><td><code>${escapeHtml(finding.slug)}</code></td><td>${finding.dimension}</td><td>${finding.ladderRank}</td><td><span class="pill ${escapeHtml(finding.disposition)}">${escapeHtml(finding.disposition)}</span></td><td>${finding.issue ? `#${finding.issue}` : "—"}</td><td>${escapeHtml(finding.title)}</td></tr>`
    )
    .join("");

  return [
    `<section class="panel">`,
    `<h2>Findings</h2>`,
    `<table><thead><tr><th>Slug</th><th>Dim</th><th>Ladder</th><th>Disposition</th><th>Issue</th><th>Title</th></tr></thead><tbody>${rows}</tbody></table>`,
    `</section>`
  ].join("\n      ");
};

const STYLE = `
:root{--bg:#0f1115;--panel:#171a21;--line:#272c36;--text:#e6e9ef;--muted:#98a1b3;--top:#3fb950;--good:#56d364;--fair:#d29922;--weak:#db6d28;--bad:#f85149;--accent:#58a6ff}
@media(prefers-color-scheme:light){:root{--bg:#f6f7f9;--panel:#fff;--line:#e2e5ea;--text:#1c2027;--muted:#5b6472;--accent:#0969da}}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
h1{margin:0 0 4px;font-size:22px}h2{margin:0 0 14px;font-size:15px;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}h3{margin:0;font-size:13px;font-weight:600}
.wrap{max-width:1100px;margin:0 auto}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:28px}
.meta{color:var(--muted);font-size:13px}
.overall{text-align:right}.overall b{display:block;font-size:44px;line-height:1}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:20px;overflow-x:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.card header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.idx{width:20px;height:20px;border-radius:5px;background:var(--line);color:var(--muted);font-size:11px;display:grid;place-items:center;flex:none}
.score{margin:0 0 8px;font-size:26px;font-weight:600;display:flex;align-items:baseline;gap:8px}
.delta{font-size:12px;font-weight:500;color:var(--muted)}
.gauge{height:6px;border-radius:3px;background:var(--line);overflow:hidden}.gauge i{display:block;height:100%;background:var(--accent)}
.band-top .gauge i{background:var(--top)}.band-good .gauge i{background:var(--good)}.band-fair .gauge i{background:var(--fair)}.band-weak .gauge i{background:var(--weak)}.band-bad .gauge i{background:var(--bad)}
.evidence{margin:10px 0 0;color:var(--muted);font-size:12px}
.calibration{margin:6px 0 0;font-size:12px;color:var(--fair)}
.empty{color:var(--muted);margin:0}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:500}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.pill{padding:2px 8px;border-radius:20px;font-size:11px;background:var(--line)}
.pill.regression,.pill.open{color:var(--bad)}.pill.fixed{color:var(--top)}
.flow{display:block;max-width:none}
.flow .edge{fill:none;stroke:var(--line);stroke-width:1.5}
.flow marker path{fill:var(--line)}
.flow .edge-label{fill:var(--muted);font-size:10px;text-anchor:middle}
.flow .node rect{fill:var(--bg);stroke:var(--accent);stroke-width:1.5}
.flow .node text{fill:var(--text);font-size:11px;text-anchor:middle}
.flow .tone-1 rect{stroke:var(--top)}.flow .tone-2 rect{stroke:var(--fair)}.flow .tone-3 rect{stroke:var(--weak)}.flow .tone-4 rect{stroke:var(--bad)}.flow .tone-5 rect{stroke:var(--muted)}
.trend{width:100%;height:auto}.trend-line{fill:none;stroke:var(--accent);stroke-width:2}.trend circle{fill:var(--accent)}
.caption{color:var(--muted);font-size:12px;margin:0 0 12px}
`;

export const renderDashboardHtml = (data: LedgerData, flows: Flow[]): string => {
  const runs = [...data.runs].sort((left, right) => left.date.localeCompare(right.date));
  const latest = runs[runs.length - 1];
  const previous = runs.length > 1 ? runs[runs.length - 2] : undefined;

  const header = latest
    ? `<div class="meta">${escapeHtml(latest.date)} · <code>${escapeHtml(latest.commit.slice(0, 7))}</code> · ${escapeHtml(latest.mode)} · ${escapeHtml(latest.agent)}</div>`
    : `<div class="meta">No runs recorded yet</div>`;

  const overall = latest
    ? `<div class="overall"><b>${latest.overall}</b><span class="meta">${escapeHtml(previous ? delta(latest.overall, previous.overall) : "first run")}</span></div>`
    : "";

  const diagrams = flows
    .map((flow) =>
      [
        `<section class="panel">`,
        `<h2>${escapeHtml(flow.title)}</h2>`,
        `<p class="caption">${escapeHtml(flow.caption)}</p>`,
        renderFlowSvg(flow),
        `</section>`
      ].join("\n      ")
    )
    .join("\n      ");

  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />`,
    `<title>Monorepo Health Scorecard</title><style>${STYLE}</style></head>`,
    `<body><div class="wrap">`,
    `      <div class="top"><div><h1>Monorepo Health Scorecard</h1>${header}</div>${overall}</div>`,
    `      <section class="panel"><h2>Dimensions</h2><div class="grid">`,
    `      ${dimensionCards(latest, previous)}`,
    `      </div></section>`,
    `      ${trendSvg(runs)}`,
    `      ${findingsTable(latest)}`,
    `      ${diagrams}`,
    `</div></body></html>`,
    ""
  ].join("\n");
};
