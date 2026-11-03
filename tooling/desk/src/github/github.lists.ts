import { z } from "zod";

import { parseContract } from "./github.contract";
import type { GhClient } from "./github.gh";
import { READY_LABEL } from "./github.issue";
import type { GithubLists, GithubPull } from "../contracts";
import type { IssueListEntry } from "../store/store.issue";

/**
 * The open issues and pull requests of the repository, for the Start dialog and the board.
 * It only reads. Starting an issue still goes through intake, which checks who applied
 * `ready-for-agent` and fingerprints the trusted text: this list is a shortcut to the number.
 */

/** `gh` lists at most this many of each. A repository with more shows the newest. */
export const OPEN_LIST_LIMIT = 100;

const openIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  labels: z.array(z.object({ name: z.string() })),
  body: z.string(),
  updatedAt: z.string()
});
export type OpenIssue = z.infer<typeof openIssueSchema>;

/** A check run or a commit status of the PR head, as `statusCheckRollup` lists it. */
const rollupItemSchema = z.object({
  status: z.string().optional(),
  conclusion: z.string().nullable().optional(),
  state: z.string().optional()
});

const openPullSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  headRefName: z.string(),
  headRefOid: z.string().default(""),
  author: z.object({ login: z.string() }).nullable(),
  updatedAt: z.string(),
  statusCheckRollup: z.array(rollupItemSchema).nullable().default([]),
  reviewDecision: z.string().nullable().default(""),
  labels: z.array(z.object({ name: z.string() })).default([])
});
export type OpenPull = z.infer<typeof openPullSchema>;

export interface OpenWork {
  readonly issues: readonly OpenIssue[];
  readonly pulls: readonly OpenPull[];
}

/** Two `gh` calls. `gh issue list` leaves pull requests out. */
export const fetchOpenWork = async (gh: GhClient): Promise<OpenWork> => {
  const limit = String(OPEN_LIST_LIMIT);
  const [issues, pulls] = await Promise.all([
    gh.json(z.array(openIssueSchema), [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      limit,
      "--json",
      "number,title,url,labels,body,updatedAt"
    ]),
    gh.json(z.array(openPullSchema), [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      limit,
      "--json",
      "number,title,url,isDraft,headRefName,headRefOid,author,updatedAt,statusCheckRollup,reviewDecision,labels"
    ])
  ]);
  return { issues, pulls };
};

const FAILED = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "ERROR"
]);
const WAITING = new Set(["QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED", "EXPECTED"]);

/**
 * The PR head's CI in one word: `failing` when any check failed, else `running` while any runs,
 * else `passing`, or `none` without checks. A check run has a status and a conclusion; a commit
 * status has a state.
 */
export const ciSummary = (
  rollup: readonly z.infer<typeof rollupItemSchema>[]
): GithubPull["ci"] => {
  const failing = rollup.filter(
    (item) => FAILED.has(item.conclusion ?? "") || FAILED.has(item.state ?? "")
  ).length;
  const running = rollup.some(
    (item) =>
      (item.status !== undefined && item.status !== "COMPLETED") || WAITING.has(item.state ?? "")
  );
  const state =
    failing > 0 ? "failing" : running ? "running" : rollup.length > 0 ? "passing" : "none";
  return { state, failing };
};

const REVIEW: Readonly<Record<string, GithubPull["review"]>> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes-requested",
  REVIEW_REQUIRED: "required"
};

/** The branch names the desk gives: `KAINE-<issue>-<type>-<slug>`. */
const DESK_BRANCH = /^KAINE-([1-9]\d{0,8})-/;

/**
 * What the page shows. The issue body stays on the server: the page gets only its contract
 * count. A pull request names its desk issue when the desk shipped it or its branch says so.
 * `flowFor` names the flow Start picks for an issue from its labels.
 */
export const toGithubLists = (
  work: OpenWork,
  entries: readonly IssueListEntry[],
  fetchedAt: string,
  flowFor: (labels: readonly string[]) => string
): Extract<GithubLists, { ok: true }> => {
  const onBoard = new Set(entries.map((entry) => entry.issueNumber));
  const shippedAs = new Map<number, number>();
  const checks = new Map<number, GithubPull["check"]>();
  for (const entry of entries) {
    const pr = entry.result.status === "ok" ? entry.result.state.prNumber : null;
    if (pr !== null && pr !== undefined) shippedAs.set(pr, entry.issueNumber);
    const check = entry.result.status === "ok" ? entry.result.state.prCheck : null;
    if (check !== null && check !== undefined) {
      checks.set(entry.issueNumber, {
        at: check.at,
        headSha: check.headSha,
        failingChecks: check.failingChecks,
        comments: check.comments,
        authors: check.authors,
        skipped: check.skipped
      });
    }
  }
  return {
    ok: true,
    fetchedAt,
    issues: work.issues.map((issue) => {
      const labels = issue.labels.map((label) => label.name);
      const contract = parseContract(issue.body);
      return {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        labels,
        ready: labels.includes(READY_LABEL),
        contract: { found: contract.found, total: contract.total },
        onBoard: onBoard.has(issue.number),
        flowId: flowFor(labels),
        updatedAt: issue.updatedAt
      };
    }),
    pulls: work.pulls.map((pull) => {
      const branchIssue = DESK_BRANCH.exec(pull.headRefName)?.[1];
      const issue =
        shippedAs.get(pull.number) ?? (branchIssue === undefined ? null : Number(branchIssue));
      return {
        number: pull.number,
        title: pull.title,
        url: pull.url,
        draft: pull.isDraft,
        branch: pull.headRefName,
        author: pull.author?.login ?? null,
        updatedAt: pull.updatedAt,
        issue,
        ci: ciSummary(pull.statusCheckRollup ?? []),
        review: REVIEW[pull.reviewDecision ?? ""] ?? "none",
        labels: pull.labels.map((label) => label.name),
        // The last check counts only while it read the head the PR has now.
        check: (() => {
          const last = issue === null ? undefined : checks.get(issue);
          return last !== undefined && last !== null && last.headSha === pull.headRefOid
            ? last
            : null;
        })()
      };
    })
  };
};
