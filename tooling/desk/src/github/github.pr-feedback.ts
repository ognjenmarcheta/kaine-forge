import { z } from "zod";

import { fenceUntrusted } from "./github.authorization";
import type { GhClient } from "./github.gh";
import { redact } from "../log/log.redact";

/**
 * Feedback on the open PR for the builder: reviews, inline review comments,
 * conversation comments, and failing checks with the log tail of a failed
 * GitHub Actions run. Every call here is a read (`gh api --method GET`,
 * `gh run view`). Every response is parsed at the boundary.
 *
 * All of it is third-party text. `selectPrFeedback` keeps only authors with a
 * trusted association and only what applies to the PR head, and
 * `renderPrFeedback` redacts, cuts, and fences it before it reaches a prompt.
 */

const actorSchema = z.object({ login: z.string(), type: z.string().optional() }).nullable();

const reviewSchema = z.object({
  id: z.number().int(),
  user: actorSchema,
  body: z.string().nullable(),
  state: z.string(),
  commit_id: z.string().nullable(),
  submitted_at: z.string().nullable().optional(),
  author_association: z.string(),
  html_url: z.string()
});

const inlineCommentSchema = z.object({
  id: z.number().int(),
  user: actorSchema,
  body: z.string(),
  path: z.string(),
  line: z.number().int().nullable().optional(),
  commit_id: z.string(),
  created_at: z.string(),
  author_association: z.string(),
  html_url: z.string()
});

const conversationCommentSchema = z.object({
  id: z.number().int(),
  user: actorSchema,
  body: z.string().nullable(),
  created_at: z.string(),
  author_association: z.string(),
  html_url: z.string()
});

const checkRunSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  head_sha: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  details_url: z.string().nullable(),
  output: z
    .object({ title: z.string().nullable(), summary: z.string().nullable() })
    .nullable()
    .optional()
});

const checkRunsSchema = z.object({ check_runs: z.array(checkRunSchema) });

export interface PullRequestFeedbackRaw {
  readonly reviews: readonly z.infer<typeof reviewSchema>[];
  readonly inlineComments: readonly z.infer<typeof inlineCommentSchema>[];
  readonly conversationComments: readonly z.infer<typeof conversationCommentSchema>[];
  readonly checkRuns: readonly z.infer<typeof checkRunSchema>[];
  /** `gh run view <id> --log-failed` output, by GitHub Actions run id. */
  readonly failedLogs: Readonly<Record<string, string>>;
}

type CheckRun = PullRequestFeedbackRaw["checkRuns"][number];

const FAILING_CONCLUSIONS: ReadonlySet<string> = new Set([
  "failure",
  "timed_out",
  "cancelled",
  "action_required"
]);

const ACTIONS_RUN = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(\d+)(?:[/?#]|$)/;

const runIdOf = (check: CheckRun): string | null =>
  check.details_url === null ? null : (ACTIONS_RUN.exec(check.details_url)?.[1] ?? null);

const failingOnHead = (checks: readonly CheckRun[], headSha: string): CheckRun[] =>
  checks.filter(
    (check) =>
      check.head_sha === headSha &&
      check.conclusion !== null &&
      FAILING_CONCLUSIONS.has(check.conclusion)
  );

/** Read everything a feedback round may use. The log of a run that cannot be read is skipped. */
export const fetchPullRequestFeedback = async (
  gh: GhClient,
  pr: number,
  headSha: string
): Promise<PullRequestFeedbackRaw> => {
  const repo = "repos/{owner}/{repo}";
  const [reviews, inlineComments, conversationComments, checks] = await Promise.all([
    gh.apiPages(reviewSchema, `${repo}/pulls/${pr}/reviews`),
    gh.apiPages(inlineCommentSchema, `${repo}/pulls/${pr}/comments`),
    gh.apiPages(conversationCommentSchema, `${repo}/issues/${pr}/comments`),
    gh.api(checkRunsSchema, `${repo}/commits/${headSha}/check-runs?per_page=100`)
  ]);
  const runIds = [
    ...new Set(failingOnHead(checks.check_runs, headSha).flatMap((check) => runIdOf(check) ?? []))
  ];
  const failedLogs: Record<string, string> = {};
  for (const runId of runIds) {
    try {
      failedLogs[runId] = await gh.text(["run", "view", runId, "--log-failed"]);
    } catch {
      // An expired or hidden log leaves the failing check without its tail.
    }
  }
  return {
    reviews,
    inlineComments,
    conversationComments,
    checkRuns: checks.check_runs,
    failedLogs
  };
};

// --- selection -------------------------------------------------------------

export interface PrFeedbackComment {
  readonly kind: "review" | "inline" | "conversation";
  readonly author: string;
  readonly association: string;
  readonly url: string;
  readonly body: string;
  /** Review state, for example `CHANGES_REQUESTED`. */
  readonly state?: string;
  readonly path?: string;
  readonly line?: number | null;
}

export interface PrFeedbackCheck {
  readonly name: string;
  readonly conclusion: string;
  readonly url: string | null;
  readonly summary: string | null;
  /** The failed jobs' log of the GitHub Actions run, once per run. */
  readonly log: string | null;
}

export interface SelectedPrFeedback {
  readonly comments: readonly PrFeedbackComment[];
  readonly failingChecks: readonly PrFeedbackCheck[];
  /** `login (association)` of each author whose text on the head was left out for trust. */
  readonly skipped: readonly string[];
}

export interface PrFeedbackFilter {
  /** The PR head the feedback must apply to. */
  readonly headSha: string;
  /** Conversation comments count only when they are newer. `null`: all of them count. */
  readonly since: string | null;
  /** `author_association` values whose text may reach a prompt. */
  readonly trusted: readonly string[];
  /**
   * GitHub App logins, such as `coderabbitai[bot]`, whose text may reach a
   * prompt without a trusted association. The owner lists them in `reviewBots`.
   */
  readonly trustedBots: readonly string[];
}

type Actor = z.infer<typeof actorSchema>;

/**
 * Keep what the builder may read: text of a trusted association, or of a
 * review bot the owner allowed (a GitHub App account, matched by exact login);
 * reviews and inline comments on the head commit, conversation comments after
 * `since`, and failing checks on the head. Every author left out for trust is
 * named in `skipped`, so a round never drops a reviewer silently.
 */
export const selectPrFeedback = (
  raw: PullRequestFeedbackRaw,
  filter: PrFeedbackFilter
): SelectedPrFeedback => {
  const skipped = new Set<string>();
  const author = (user: Actor): string => user?.login ?? "ghost";
  const trusted = (user: Actor, association: string): boolean => {
    const allowedBot = user?.type === "Bot" && filter.trustedBots.includes(user.login);
    if (filter.trusted.includes(association) || allowedBot) return true;
    skipped.add(`${author(user)} (${association})`);
    return false;
  };
  const since = filter.since === null ? null : Date.parse(filter.since);

  const reviews = raw.reviews.flatMap((review): PrFeedbackComment[] =>
    review.commit_id === filter.headSha &&
    (review.body ?? "").trim() !== "" &&
    trusted(review.user, review.author_association)
      ? [
          {
            kind: "review",
            author: author(review.user),
            association: review.author_association,
            url: review.html_url,
            body: review.body ?? "",
            state: review.state
          }
        ]
      : []
  );
  const inline = raw.inlineComments.flatMap((comment): PrFeedbackComment[] =>
    comment.commit_id === filter.headSha && trusted(comment.user, comment.author_association)
      ? [
          {
            kind: "inline",
            author: author(comment.user),
            association: comment.author_association,
            url: comment.html_url,
            body: comment.body,
            path: comment.path,
            line: comment.line ?? null
          }
        ]
      : []
  );
  const conversation = raw.conversationComments.flatMap((comment): PrFeedbackComment[] =>
    (since === null || Date.parse(comment.created_at) > since) &&
    (comment.body ?? "").trim() !== "" &&
    trusted(comment.user, comment.author_association)
      ? [
          {
            kind: "conversation",
            author: author(comment.user),
            association: comment.author_association,
            url: comment.html_url,
            body: comment.body ?? ""
          }
        ]
      : []
  );

  const logged = new Set<string>();
  const failingChecks = failingOnHead(raw.checkRuns, filter.headSha).map(
    (check): PrFeedbackCheck => {
      const runId = runIdOf(check);
      const log =
        runId === null || logged.has(runId) ? undefined : (raw.failedLogs[runId] ?? undefined);
      if (runId !== null && log !== undefined) logged.add(runId);
      return {
        name: check.name,
        conclusion: check.conclusion ?? "failure",
        url: check.details_url,
        summary: check.output?.summary ?? check.output?.title ?? null,
        log: log ?? null
      };
    }
  );

  return {
    comments: [...reviews, ...inline, ...conversation],
    failingChecks,
    skipped: [...skipped]
  };
};

// --- rendering -------------------------------------------------------------

const COMMENT_MAX = 2 * 1024;
const LOG_TAIL_MAX = 6 * 1024;
const TOTAL_MAX = 24 * 1024;

const keepStart = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}\n[cut: ${text.length - max} more characters]`;

const keepEnd = (text: string, max: number): string =>
  text.length <= max
    ? text
    : `[cut: ${text.length - max} earlier characters of the log]\n${text.slice(-max)}`;

/** Each item redacted and cut to its own limit. This is also what `pr-feedback.json` keeps. */
/**
 * Drops HTML comments and folds each `<details>` block to its summary. Review
 * bots put metadata and long analysis there, ahead of the finding, and the
 * 2 KB cut would otherwise keep only that.
 */
const foldMarkup = (body: string): string =>
  body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<details>\s*(?:<summary>([\s\S]*?)<\/summary>)?[\s\S]*?<\/details>/g,
      (_all, summary) =>
        typeof summary === "string" && summary.trim() !== ""
          ? `[details folded: ${summary.replace(/<[^>]*>/g, "").trim()}]`
          : "[details folded]"
    );

export const boundPrFeedback = (selected: SelectedPrFeedback): SelectedPrFeedback => ({
  comments: selected.comments.map((comment) => ({
    ...comment,
    body: keepStart(redact(foldMarkup(comment.body)).trim(), COMMENT_MAX)
  })),
  failingChecks: selected.failingChecks.map((check) => ({
    ...check,
    summary: check.summary === null ? null : keepStart(redact(check.summary).trim(), COMMENT_MAX),
    log: check.log === null ? null : keepEnd(redact(check.log).trimEnd(), LOG_TAIL_MAX)
  })),
  skipped: selected.skipped
});

const describeComment = (comment: PrFeedbackComment): string => {
  const who = `${comment.author} (${comment.association})`;
  const where =
    comment.kind === "inline"
      ? `inline comment on ${comment.path ?? "?"}${comment.line == null ? "" : `:${comment.line}`}`
      : comment.kind === "review"
        ? `review, ${comment.state ?? "COMMENTED"}`
        : "comment";
  return [`### ${who}: ${where}`, comment.url, "", comment.body].join("\n");
};

const describeCheck = (check: PrFeedbackCheck): string =>
  [
    `### Failing check: ${check.name} (${check.conclusion})`,
    ...(check.url === null ? [] : [check.url]),
    ...(check.summary === null ? [] : ["", check.summary]),
    ...(check.log === null ? [] : ["", "Log of the failed jobs (end):", check.log])
  ].join("\n");

/**
 * The feedback as one fenced block for the builder prompt: every item redacted
 * and cut (a log keeps its end, a comment its start, each cut marked), the
 * whole under 24 KB, and wrapped as untrusted data. `fenceUntrusted` removes
 * fence markers inside the text, so a comment cannot close the fence.
 */
export const renderPrFeedback = (selected: SelectedPrFeedback): string => {
  const bounded = boundPrFeedback(selected);
  const sections = [
    ...bounded.failingChecks.map(describeCheck),
    ...bounded.comments.map(describeComment)
  ];
  const kept: string[] = [];
  let size = 0;
  for (const [index, section] of sections.entries()) {
    if (size + section.length > TOTAL_MAX) {
      kept.push(`[cut: ${sections.length - index} more item(s) left out to stay under 24 KB]`);
      break;
    }
    kept.push(section);
    size += section.length + 2;
  }
  return fenceUntrusted(kept.join("\n\n"), "GitHub pull request");
};
