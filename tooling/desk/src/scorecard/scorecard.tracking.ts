import { z } from "zod";

import {
  SCORECARD_LABEL,
  type ScorecardFix,
  type ScorecardRun,
  type TrackedIssue
} from "../contracts";
import type { GhClient } from "../github/github.gh";

/**
 * Where the Scorecard view follows its findings: the issues the ledger names, the issues the
 * scorecard jobs filed, and the issues that carry `source:scorecard`. GitHub owns their state and
 * their fixes, so the desk reads them live and keeps nothing.
 */

/** A source of tracked issues and the finding slug each one was filed for, when known. */
export interface TrackedSources {
  /** Issue number to finding slug. `null` when only the label names the issue. */
  readonly slugs: ReadonlyMap<number, string | null>;
}

/** The ledger's findings with an issue, newest run last, and the scorecard jobs' filed issues. */
export const trackedSources = (
  runs: readonly Pick<ScorecardRun, "findings">[],
  filed: readonly { readonly slug: string; readonly number: number }[]
): TrackedSources => {
  const slugs = new Map<number, string | null>();
  for (const run of runs) {
    for (const finding of run.findings) {
      if (finding.issue !== undefined) slugs.set(finding.issue, finding.slug);
    }
  }
  for (const issue of filed) slugs.set(issue.number, issue.slug);
  return { slugs };
};

const prSchema = z.object({
  number: z.number().int().positive(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  mergedAt: z.string().nullable()
});

const issueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED"]),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
  closedByPullRequestsReferences: z.object({ nodes: z.array(prSchema) })
});
export type RawTrackedIssue = z.infer<typeof issueSchema>;

const responseSchema = z.object({
  data: z.object({
    repository: z.record(z.string(), z.unknown()).nullable().optional(),
    search: z.object({ nodes: z.array(z.unknown()) }).optional()
  })
});

const FIELDS = `fragment F on Issue {
  number title url state createdAt closedAt
  labels(first: 20) { nodes { name } }
  closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
    nodes { number url state mergedAt }
  }
}`;

/**
 * The GraphQL query and its variables: one alias per issue number (`issueOrPullRequest`, so a
 * number that is a PR reads as nothing instead of failing), and the label search when `search`
 * is set. GraphQL refuses a declared variable the query does not use, so each is declared only
 * when its part is there.
 */
/** How many issues the fallback reads at the same time. */
const FALLBACK_BATCH = 5;

const queryOf = (
  numbers: readonly number[],
  search: boolean,
  values: { readonly owner: string; readonly name: string; readonly q: string }
): { readonly query: string; readonly variables: Readonly<Record<string, string>> } => {
  const declared = [
    ...(numbers.length > 0 ? ["$owner: String!", "$name: String!"] : []),
    ...(search ? ["$q: String!"] : [])
  ];
  const variables = {
    ...(numbers.length > 0 ? { owner: values.owner, name: values.name } : {}),
    ...(search ? { q: values.q } : {})
  };
  const aliases = numbers
    .map((number) => `i${String(number)}: issueOrPullRequest(number: ${String(number)}) { ...F }`)
    .join(" ");
  return {
    query: [
      `query(${declared.join(", ")}) {`,
      numbers.length === 0 ? "" : `repository(owner: $owner, name: $name) { ${aliases} }`,
      search ? "search(query: $q, type: ISSUE, first: 100) { nodes { ...F } }" : "",
      "}",
      FIELDS
    ].join("\n"),
    variables
  };
};

const issuesOf = (nodes: readonly unknown[]): RawTrackedIssue[] =>
  nodes.flatMap((node) => {
    const parsed = issueSchema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });

/**
 * Read the tracked issues and the labelled ones in one call. GitHub refuses the whole call when
 * one number does not exist (a deleted or moved issue); then each number is read on its own and a
 * missing one is left out.
 */
export const fetchTrackedIssues = async (
  gh: GhClient,
  repository: string,
  numbers: readonly number[]
): Promise<RawTrackedIssue[]> => {
  const [owner = "", name = ""] = repository.split("/");
  const values = { owner, name, q: `repo:${repository} is:issue label:${SCORECARD_LABEL}` };
  const ask = async (batch: readonly number[], search: boolean): Promise<RawTrackedIssue[]> => {
    const response = await gh.api(responseSchema, "graphql", {
      method: "POST",
      body: queryOf(batch, search, values)
    });
    return [
      ...issuesOf(Object.values(response.data.repository ?? {})),
      ...issuesOf(response.data.search?.nodes ?? [])
    ];
  };
  try {
    return await ask(numbers, true);
  } catch {
    const labelled = await ask([], true);
    // A few reads at a time: the ledger grows with each run, and GitHub limits parallel calls.
    const each: RawTrackedIssue[] = [];
    for (let start = 0; start < numbers.length; start += FALLBACK_BATCH) {
      const read = await Promise.all(
        numbers
          .slice(start, start + FALLBACK_BATCH)
          .map((number) => ask([number], false).catch((): RawTrackedIssue[] => []))
      );
      each.push(...read.flat());
    }
    return [...labelled, ...each];
  }
};

/** The PR that answers for the issue: a merged one (the latest), else an open one, else a closed one. */
export const fixOf = (
  prs: RawTrackedIssue["closedByPullRequestsReferences"]["nodes"]
): ScorecardFix | null => {
  const rank = { MERGED: 0, OPEN: 1, CLOSED: 2 } as const;
  const best = [...prs].sort(
    (left, right) =>
      rank[left.state] - rank[right.state] ||
      (right.mergedAt ?? "").localeCompare(left.mergedAt ?? "")
  )[0];
  return best === undefined
    ? null
    : {
        number: best.number,
        url: best.url,
        state: best.state === "MERGED" ? "merged" : best.state === "OPEN" ? "open" : "closed",
        mergedAt: best.mergedAt
      };
};

/** The page's list: one entry per issue, newest first, with its finding slug and desk run. */
export const toTrackedIssues = (
  raw: readonly RawTrackedIssue[],
  sources: TrackedSources,
  runs: ReadonlyMap<number, { readonly stage: string; readonly status: string }>
): TrackedIssue[] => {
  const byNumber = new Map(raw.map((issue) => [issue.number, issue]));
  return [...byNumber.values()]
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: issue.state === "OPEN" ? ("open" as const) : ("closed" as const),
      createdAt: issue.createdAt,
      closedAt: issue.closedAt,
      labeled: issue.labels.nodes.some((label) => label.name === SCORECARD_LABEL),
      slug: sources.slugs.get(issue.number) ?? null,
      fix: fixOf(issue.closedByPullRequestsReferences.nodes),
      run: runs.get(issue.number) ?? null
    }))
    .sort((left, right) => right.number - left.number);
};
