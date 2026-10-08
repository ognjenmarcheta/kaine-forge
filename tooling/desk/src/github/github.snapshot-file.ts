import { readFile } from "node:fs/promises";
import { z } from "zod";

import type { GitHubPort } from "../ports";
import type { IssueSnapshot } from "./github.types";

/**
 * Dev and test path: read an `IssueSnapshot` from a JSON file instead of
 * `gh`. An end-to-end run then needs no GitHub. The file is not a source of
 * trust, so a run that uses it must also pass `--override`.
 */

const timestamp = z.string().min(1);

export const issueSnapshotSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    url: z.string().min(1),
    open: z.boolean(),
    author: z.string().nullable(),
    labels: z.array(z.string()),
    comments: z.array(
      z.object({
        url: z.string(),
        body: z.string(),
        createdAt: timestamp,
        author: z.string().nullable(),
        authorAssociation: z.string()
      })
    ),
    labelEvents: z.array(
      z.object({
        id: z.number(),
        action: z.enum(["labeled", "unlabeled"]),
        label: z.string(),
        actor: z.string().nullable(),
        createdAt: timestamp
      })
    )
  })
  .strict();

export class SnapshotFileError extends Error {
  override readonly name = "SnapshotFileError";
}

export const readSnapshotFile = async (file: string): Promise<IssueSnapshot> => {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new SnapshotFileError(
      `Cannot read the snapshot file ${file}: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new SnapshotFileError(`The snapshot file ${file} is not valid JSON.`);
  }
  const parsed = issueSnapshotSchema.safeParse(json);
  if (!parsed.success) {
    throw new SnapshotFileError(
      `The snapshot file ${file} does not match the issue snapshot format: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
};

/**
 * A `GitHubPort` that serves one snapshot and writes nothing. `gh` is
 * "signed in" as `owner`, so the identity check passes and authorization
 * reduces to the `--override` rule.
 */
export const createSnapshotGitHubPort = (snapshot: IssueSnapshot, owner: string): GitHubPort => ({
  repository: () =>
    Promise.resolve({ fullName: `${owner}/snapshot`, ownerLogin: owner, ownerType: "User" }),
  viewer: () => Promise.resolve(owner),
  fetchIssue: () => Promise.resolve(snapshot),
  editLabels: () => Promise.resolve(),
  upsertStatusComment: () => Promise.resolve({ action: "unchanged", commentId: 0 }),
  createLabel: () => Promise.resolve(),
  // An offline snapshot cannot reach GitHub, so it can never ship.
  findPullRequest: () => Promise.resolve(null),
  createPullRequest: () => Promise.reject(new Error("A snapshot run cannot open a pull request")),
  addPullRequestLabel: () => Promise.reject(new Error("A snapshot run cannot label a pull request"))
});
