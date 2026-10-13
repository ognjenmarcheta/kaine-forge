import { z } from "zod";

import { parseContract } from "./github.contract";
import type { GhClient } from "./github.gh";
import { READY_LABEL } from "./github.issue";
import type { GithubLists } from "../contracts";
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

const openPullSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  headRefName: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  updatedAt: z.string()
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
      "number,title,url,isDraft,headRefName,author,updatedAt"
    ])
  ]);
  return { issues, pulls };
};

/** The branch names the desk gives: `KAINE-<issue>-<type>-<slug>`. */
const DESK_BRANCH = /^KAINE-([1-9]\d{0,8})-/;

/**
 * What the page shows. The issue body stays on the server: the page gets only its contract
 * count. A pull request names its desk issue when the desk shipped it or its branch says so.
 */
export const toGithubLists = (
  work: OpenWork,
  entries: readonly IssueListEntry[],
  fetchedAt: string
): Extract<GithubLists, { ok: true }> => {
  const onBoard = new Set(entries.map((entry) => entry.issueNumber));
  const shippedAs = new Map<number, number>();
  for (const entry of entries) {
    const pr = entry.result.status === "ok" ? entry.result.state.prNumber : null;
    if (pr !== null && pr !== undefined) shippedAs.set(pr, entry.issueNumber);
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
        updatedAt: issue.updatedAt
      };
    }),
    pulls: work.pulls.map((pull) => {
      const branchIssue = DESK_BRANCH.exec(pull.headRefName)?.[1];
      return {
        number: pull.number,
        title: pull.title,
        url: pull.url,
        draft: pull.isDraft,
        branch: pull.headRefName,
        author: pull.author?.login ?? null,
        updatedAt: pull.updatedAt,
        issue:
          shippedAs.get(pull.number) ?? (branchIssue === undefined ? null : Number(branchIssue))
      };
    })
  };
};
