import type { Exec, GitHubPort } from "../ports";
import { createGhClient, fetchRepository, fetchViewer } from "./github.gh";
import { fetchIssueSnapshot } from "./github.issue";
import { labelCreateArgv } from "./github.labels";
import { addPullRequestLabelArgv, createPullRequest, findPullRequest } from "./github.pull-request";
import { upsertStatusComment } from "./github.status-comment";
import type { RepositoryInfo } from "./github.types";

export interface GitHubPortOptions {
  readonly exec: Exec;
  /** The checkout that `gh` resolves the repository from. */
  readonly cwd?: string | undefined;
}

/** The real `GitHubPort`: `gh` over an `Exec`. It caches the repository and the viewer. */
export const createGitHubPort = ({ exec, cwd }: GitHubPortOptions): GitHubPort => {
  const gh = createGhClient({ exec, cwd });
  let repository: Promise<RepositoryInfo> | null = null;
  let viewer: Promise<string> | null = null;
  const cachedRepository = (): Promise<RepositoryInfo> => (repository ??= fetchRepository(gh));
  const cachedViewer = (): Promise<string> => (viewer ??= fetchViewer(gh));
  // A failed lookup must not stay cached.
  const forget = <T>(promise: Promise<T>, reset: () => void): Promise<T> =>
    promise.catch((error: unknown) => {
      reset();
      throw error;
    });

  return {
    repository: () =>
      forget(cachedRepository(), () => {
        repository = null;
      }),
    viewer: () =>
      forget(cachedViewer(), () => {
        viewer = null;
      }),
    fetchIssue: async (issueNumber) =>
      fetchIssueSnapshot(gh, (await cachedRepository()).fullName, issueNumber),
    editLabels: async (issueNumber, change) => {
      const argv = ["issue", "edit", String(issueNumber)];
      for (const label of change.add) argv.push("--add-label", label);
      for (const label of change.remove) argv.push("--remove-label", label);
      await gh.text(argv);
    },
    upsertStatusComment: async (issueNumber, body) =>
      upsertStatusComment(
        gh,
        (await cachedRepository()).fullName,
        await cachedViewer(),
        issueNumber,
        body
      ),
    createLabel: async (definition) => {
      await gh.text(labelCreateArgv(definition));
    },
    findPullRequest: (branch) => findPullRequest(gh, branch),
    createPullRequest: (request) => createPullRequest(gh, request),
    addPullRequestLabel: async (pr, label) => {
      await gh.text(addPullRequestLabelArgv(pr, label));
    }
  };
};
