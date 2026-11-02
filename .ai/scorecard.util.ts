import { join } from "node:path";

import { REPO_ROOT } from "./ai.util";
import { ledgerDocument } from "./ledger-document.util";

export const LEDGER_PATH = join(REPO_ROOT, "docs", "agents", "monorepo-scorecard.md");
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

const ledger = ledgerDocument<LedgerData>({
  dataMarker: DATA_MARKER,
  generatedMarker: GENERATED_MARKER,
  parseData: (parsed) => {
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
  },
  render: (data) => renderLedgerMarkdown(data)
});

export const parseLedger = ledger.parse;
export const rewriteLedger = ledger.rewrite;

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
