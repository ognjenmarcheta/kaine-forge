import type { LabelChange, LabelDefinition } from "../github/github.labels";
import type { PullRequestFeedbackRaw } from "../github/github.pr-feedback";
import type {
  CreatePullRequestRequest,
  PullRequestInfo,
  PullRequestView
} from "../github/github.pull-request";
import type { IssueSnapshot, RepositoryInfo } from "../github/github.types";
import type { GitHubPort } from "../ports";

export const OWNER = "octo-owner";

export const BODY_WITH_CONTRACT = [
  "### Outcome",
  "",
  "Users can export a report.",
  "",
  "### Acceptance criteria",
  "",
  "- [ ] Export button downloads a CSV",
  "- [ ] Empty reports say so",
  "",
  "### Scope",
  "",
  "apps/web",
  "",
  "### Validation",
  "",
  "code",
  "",
  "### Evidence",
  "",
  "apps/web/src/report.tsx:12",
  "",
  "### Out of scope",
  "",
  "PDF export"
].join("\n");

export const snapshotOf = (over: Partial<IssueSnapshot> = {}): IssueSnapshot => ({
  number: 7,
  title: "Export reports",
  body: BODY_WITH_CONTRACT,
  url: "https://github.com/octo-owner/repo/issues/7",
  open: true,
  author: OWNER,
  labels: ["ready-for-agent"],
  comments: [],
  labelEvents: [
    {
      id: 1,
      action: "labeled",
      label: "ready-for-agent",
      actor: OWNER,
      createdAt: "2026-10-07T08:00:00Z"
    }
  ],
  ...over
});

export const repositoryOf = (over: Partial<RepositoryInfo> = {}): RepositoryInfo => ({
  fullName: `${OWNER}/repo`,
  ownerLogin: OWNER,
  ownerType: "User",
  ...over
});

export interface FakeGitHub extends GitHubPort {
  readonly labelEdits: { issue: number; change: LabelChange }[];
  readonly comments: { issue: number; body: string }[];
  readonly createdLabels: LabelDefinition[];
  readonly createdPullRequests: CreatePullRequestRequest[];
  readonly pullRequestLabels: { pr: number; label: string }[];
  /** Branches asked for with `findPullRequest`. */
  readonly pullRequestLookups: string[];
  /** Bodies written with `editIssueBody`. `fetchIssue` returns the latest. */
  readonly bodyEdits: { issue: number; body: string }[];
  /** Someone else edits the issue on GitHub. */
  readonly setIssueBody: (body: string) => void;
  /** PR numbers read with `viewPullRequest`. */
  readonly pullRequestViews: number[];
  /** The owner merges or closes the PR on GitHub. Every PR starts `OPEN`. */
  readonly setPullRequestState: (state: PullRequestView["state"]) => void;
  /** The commit at the head of every PR on GitHub. Default: forty zeros. */
  readonly setPullRequestHead: (sha: string) => void;
  /** What `fetchPullRequestFeedback` returns. Default: nothing. */
  readonly setPullRequestFeedback: (raw: PullRequestFeedbackRaw) => void;
  /** `[pr, headSha]` of every `fetchPullRequestFeedback` call. */
  readonly feedbackReads: [number, string][];
}

export const NO_PR_FEEDBACK: PullRequestFeedbackRaw = {
  reviews: [],
  inlineComments: [],
  conversationComments: [],
  checkRuns: [],
  failedLogs: {}
};

export interface FakeGitHubOptions {
  readonly snapshot?: IssueSnapshot;
  readonly repository?: RepositoryInfo;
  readonly viewer?: string;
  readonly failLabels?: boolean;
  readonly failComments?: boolean;
  readonly failRead?: boolean;
  /** A PR that already exists for every branch. */
  readonly existingPullRequest?: PullRequestInfo;
  readonly failCreatePullRequest?: boolean;
  readonly failPullRequestLabel?: boolean;
  readonly failViewPullRequest?: boolean;
  readonly failPullRequestFeedback?: boolean;
}

export const fakeGitHub = (options: FakeGitHubOptions = {}): FakeGitHub => {
  const labelEdits: FakeGitHub["labelEdits"] = [];
  const comments: FakeGitHub["comments"] = [];
  const createdLabels: LabelDefinition[] = [];
  const createdPullRequests: CreatePullRequestRequest[] = [];
  const pullRequestLabels: FakeGitHub["pullRequestLabels"] = [];
  const pullRequestLookups: string[] = [];
  const bodyEdits: FakeGitHub["bodyEdits"] = [];
  const pullRequestViews: number[] = [];
  let pullRequestState: PullRequestView["state"] = "OPEN";
  let pullRequestHead = "0".repeat(40);
  let pullRequestFeedback = NO_PR_FEEDBACK;
  const feedbackReads: FakeGitHub["feedbackReads"] = [];
  let body: string | null = null;
  return {
    labelEdits,
    comments,
    createdLabels,
    createdPullRequests,
    pullRequestLabels,
    pullRequestLookups,
    bodyEdits,
    setIssueBody: (next) => {
      body = next;
    },
    pullRequestViews,
    setPullRequestState: (state) => {
      pullRequestState = state;
    },
    setPullRequestHead: (sha) => {
      pullRequestHead = sha;
    },
    setPullRequestFeedback: (raw) => {
      pullRequestFeedback = raw;
    },
    feedbackReads,
    repository: () => Promise.resolve(options.repository ?? repositoryOf()),
    viewer: () => Promise.resolve(options.viewer ?? OWNER),
    fetchIssue: () =>
      options.failRead
        ? Promise.reject(new Error("gh issue view failed (exit 1): boom"))
        : Promise.resolve(
            body === null
              ? (options.snapshot ?? snapshotOf())
              : { ...(options.snapshot ?? snapshotOf()), body }
          ),
    editLabels: (issue, change) => {
      if (options.failLabels) return Promise.reject(new Error("label 'agent:needs-you' not found"));
      labelEdits.push({ issue, change });
      return Promise.resolve();
    },
    upsertStatusComment: (issue, body) => {
      if (options.failComments) return Promise.reject(new Error("HTTP 403"));
      comments.push({ issue, body });
      return Promise.resolve({ action: "created", commentId: 1 });
    },
    createLabel: (definition) => {
      createdLabels.push(definition);
      return Promise.resolve();
    },
    findPullRequest: (branch) => {
      pullRequestLookups.push(branch);
      const created = createdPullRequests.find((request) => request.head === branch);
      return Promise.resolve(
        options.existingPullRequest ??
          (created === undefined
            ? null
            : {
                number: 100 + createdPullRequests.indexOf(created) + 1,
                url: `https://github.com/${OWNER}/repo/pull/${100 + createdPullRequests.indexOf(created) + 1}`
              })
      );
    },
    createPullRequest: (request) => {
      if (options.failCreatePullRequest) return Promise.reject(new Error("gh pr create failed"));
      createdPullRequests.push(request);
      const number = 100 + createdPullRequests.length;
      return Promise.resolve({ number, url: `https://github.com/${OWNER}/repo/pull/${number}` });
    },
    viewPullRequest: (pr) => {
      pullRequestViews.push(pr);
      if (options.failViewPullRequest) return Promise.reject(new Error("gh pr view failed"));
      return Promise.resolve({
        number: pr,
        url: `https://github.com/${OWNER}/repo/pull/${pr}`,
        state: pullRequestState,
        headRefName: createdPullRequests[pr - 101]?.head ?? "unknown",
        headRefOid: pullRequestHead,
        mergedAt: pullRequestState === "MERGED" ? "2026-10-20T12:00:00Z" : null
      });
    },
    fetchPullRequestFeedback: (pr, headSha) => {
      feedbackReads.push([pr, headSha]);
      if (options.failPullRequestFeedback) return Promise.reject(new Error("gh api failed"));
      return Promise.resolve(pullRequestFeedback);
    },
    addPullRequestLabel: (pr, label) => {
      if (options.failPullRequestLabel) {
        return Promise.reject(new Error(`could not add label: '${label}' not found`));
      }
      pullRequestLabels.push({ pr, label });
      return Promise.resolve();
    },
    editIssueBody: (issue, next) => {
      bodyEdits.push({ issue, body: next });
      body = next;
      return Promise.resolve();
    }
  };
};
