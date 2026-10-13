import { z } from "zod";

import type { GhClient } from "./github.gh";
import { GhError } from "./github.gh";

/**
 * Pull request calls for the ship step. The desk only ever opens a draft PR:
 * there is no merge, no auto-merge, no review and no ready-for-review call
 * here, and `CreatePullRequestRequest.draft` has the type `true`.
 */

export interface PullRequestInfo {
  readonly number: number;
  readonly url: string;
}

export interface CreatePullRequestRequest {
  readonly base: string;
  readonly head: string;
  readonly title: string;
  /** Path of a file that holds the PR body. */
  readonly bodyFile: string;
  /** The only allowed value. A ready-for-review PR is the owner's action. */
  readonly draft: true;
}

const listedPullRequestSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().min(1),
  headRefName: z.string()
});

const PR_URL = /^https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/(\d+)$/;

/** The open PR whose head is `branch`, or `null` when there is none. */
export const findPullRequest = async (
  gh: GhClient,
  branch: string
): Promise<PullRequestInfo | null> => {
  const listed = await gh.json(z.array(listedPullRequestSchema), [
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "number,url,headRefName",
    "--limit",
    "10"
  ]);
  // `--head` filters by branch name only, so a fork branch of the same name can appear.
  const match = listed.find((entry) => entry.headRefName === branch);
  return match === undefined ? null : { number: match.number, url: match.url };
};

export const createPullRequestArgv = (request: CreatePullRequestRequest): string[] => [
  "pr",
  "create",
  "--base",
  request.base,
  "--head",
  request.head,
  "--draft",
  "--title",
  request.title,
  "--body-file",
  request.bodyFile
];

export const createPullRequest = async (
  gh: GhClient,
  request: CreatePullRequestRequest
): Promise<PullRequestInfo> => {
  const output = await gh.text(createPullRequestArgv(request));
  const url = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => PR_URL.test(line))
    .at(-1);
  const number = url === undefined ? undefined : PR_URL.exec(url)?.[1];
  if (url === undefined || number === undefined) {
    throw new GhError("gh pr create returned no pull request URL", "parse");
  }
  return { number: Number(number), url };
};

export const addPullRequestLabelArgv = (pr: number, label: string): string[] => [
  "pr",
  "edit",
  String(pr),
  "--add-label",
  label
];
