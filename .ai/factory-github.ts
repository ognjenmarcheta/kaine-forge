import { execFileSync } from "node:child_process";
import { z } from "zod";

import { REPO_ROOT } from "./ai.util";
import type { FactoryStore } from "./factory-store";
import {
  commentSchema,
  fingerprint,
  eventSchema,
  issueSchema,
  type FactoryConfig,
  type FactoryRun
} from "./factory.util";

export function github(
  endpoint: string,
  method = "GET",
  payload?: z.infer<ReturnType<typeof z.json>>
) {
  const args = ["api", endpoint, "--method", method];
  if (payload !== undefined) args.push("--input", "-");
  try {
    const output = execFileSync("gh", args, {
      input: payload === undefined ? undefined : JSON.stringify(payload),
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return z.json().parse(output.trim() ? JSON.parse(output) : null);
  } catch {
    throw new Error(`GitHub ${method} failed: ${endpoint.split("?")[0]}`);
  }
}

export function githubPages(endpoint: string) {
  const items: z.infer<ReturnType<typeof z.json>>[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = z
      .array(z.json())
      .parse(github(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`));
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error("GitHub pagination exceeds factory limit");
}

export function loadIssue(config: FactoryConfig, number: number) {
  const endpoint = `repos/${config.repository}/issues/${number}`;
  const issue = issueSchema.parse(github(endpoint));
  const comments = z.array(commentSchema).parse(githubPages(`${endpoint}/comments`));
  const events = z.array(eventSchema).parse(githubPages(`${endpoint}/events`));
  return { issue, comments, events };
}

export function assertControllerIdentity(config: FactoryConfig): void {
  const repository = z.object({ nameWithOwner: z.string() }).parse(
    JSON.parse(
      execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      })
    )
  );
  if (repository.nameWithOwner.toLowerCase() !== config.repository.toLowerCase())
    throw new Error("Factory repository does not match this checkout's GitHub remote");
  const user = z.object({ login: z.string() }).parse(github("user"));
  if (user.login.toLowerCase() !== config.owner.toLowerCase())
    throw new Error("gh must authenticate as the configured repository owner");
}

export function statusComment(
  config: FactoryConfig,
  run: FactoryRun,
  body: string,
  store: FactoryStore
): void {
  const endpoint = `repos/${config.repository}/issues/${run.issue}/comments`;
  const marker = `<!-- kaine-factory:${run.id} -->`;
  const existing = z
    .array(commentSchema)
    .parse(githubPages(endpoint))
    .find(
      (comment) =>
        comment.id === run.statusComment?.id &&
        comment.user.login.toLowerCase() === config.owner.toLowerCase() &&
        fingerprint(comment.body) === run.statusComment.fingerprint
    );
  store.assertActive(run.id);
  const posted = commentSchema.parse(
    github(
      existing ? `repos/${config.repository}/issues/comments/${existing.id}` : endpoint,
      existing ? "PATCH" : "POST",
      { body: `${marker}\n${body}` }
    )
  );
  run.statusComment = { id: posted.id, fingerprint: fingerprint(posted.body) };
  store.save(run);
}

const prSchema = z.object({
  number: z.number(),
  html_url: z.string().url(),
  state: z.string(),
  body: z.string().nullable(),
  head: z.object({ sha: z.string(), ref: z.string() }),
  base: z.object({ sha: z.string(), ref: z.string() })
});
export function findPullRequest(config: FactoryConfig, branch: string, state = "open") {
  const prs = z
    .array(prSchema)
    .parse(
      github(
        `repos/${config.repository}/pulls?state=${state}&head=${encodeURIComponent(`${config.repository.split("/")[0]}:${branch}`)}`
      )
    );
  if (prs.length > 1) throw new Error("Multiple pull requests match the factory branch");
  return prs[0] ?? null;
}

export function publishPullRequest(
  config: FactoryConfig,
  run: FactoryRun,
  title: string,
  body: string,
  base: string,
  assertActive: () => void
) {
  const previous = findPullRequest(config, run.branch);
  assertActive();
  const result = github(
    previous
      ? `repos/${config.repository}/pulls/${previous.number}`
      : `repos/${config.repository}/pulls`,
    previous ? "PATCH" : "POST",
    previous ? { body, title } : { title, head: run.branch, base, body, draft: true }
  );
  return prSchema.parse(result);
}

export function publishReview(
  config: FactoryConfig,
  number: number,
  expectedHead: string,
  expectedBase: string,
  body: string,
  comments: { path: string; line: number; side: string; body: string }[],
  assertActive: () => void
): void {
  const current = prSchema.parse(github(`repos/${config.repository}/pulls/${number}`));
  if (current.head.sha !== expectedHead || current.base.sha !== expectedBase)
    throw new Error("PR changed before review publication");
  assertActive();
  github(`repos/${config.repository}/pulls/${number}/reviews`, "POST", {
    event: "COMMENT",
    commit_id: expectedHead,
    body,
    comments
  });
}

export function monitoringSnapshot(config: FactoryConfig) {
  const workflows = z
    .object({
      workflow_runs: z.array(
        z.object({
          id: z.number(),
          name: z.string().nullable(),
          status: z.string(),
          conclusion: z.string().nullable(),
          html_url: z.string()
        })
      )
    })
    .parse(github(`repos/${config.repository}/actions/runs?per_page=30`));
  return workflows.workflow_runs
    .filter((run) => ["CI PR", "Release"].includes(run.name ?? ""))
    .map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url
    }));
}

export function reviewFeedback(config: FactoryConfig, issue: number) {
  return ["feat-factory", "docs-spec"].flatMap((suffix) => {
    const pr = findPullRequest(config, `KAINE-${issue}-${suffix}`, "all");
    if (!pr) return [];
    const comments = z
      .array(z.object({ id: z.number(), body: z.string(), user: z.object({ login: z.string() }) }))
      .parse(githubPages(`repos/${config.repository}/pulls/${pr.number}/comments`));
    return [
      {
        pullRequest: pr.html_url,
        comments: comments.filter(
          (comment) => comment.user.login.toLowerCase() === config.owner.toLowerCase()
        )
      }
    ];
  });
}
