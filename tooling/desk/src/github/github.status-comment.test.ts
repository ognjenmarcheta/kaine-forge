import { describe, expect, it } from "vitest";

import type { IssueState } from "../contracts";
import { statusMarker } from "./github.authorization";
import { createGhClient } from "./github.gh";
import { renderStatusComment, upsertStatusComment } from "./github.status-comment";
import { fakeExec, ok, type FakeRoute } from "../testing/exec.fake";

const state = (over: Partial<IssueState> = {}): IssueState => ({
  schemaVersion: 1,
  issueNumber: 7,
  stage: "plan-gate",
  status: "waiting",
  resumeStage: null,
  branch: "KAINE-7-feat-export-reports",
  worktreePath: null,
  sessions: {},
  loops: { check: 1, review: 0 },
  lastCheckFingerprint: null,
  history: [
    { at: "2026-10-07T09:00:00Z", stage: "intake", event: "intake-started" },
    { at: "2026-10-07T09:01:00Z", stage: "setup", event: "intake-complete", note: "contract 6/6" }
  ],
  authorization: {
    actor: "octo-owner",
    labeledAt: "2026-10-07T08:00:00.000Z",
    contentFingerprint: "f",
    override: false
  },
  createdAt: "2026-10-07T09:00:00Z",
  updatedAt: "2026-10-07T09:02:00Z",
  ...over
});

describe("renderStatusComment", () => {
  it("links the draft PR once the issue is shipped, and not before", () => {
    const url = "https://github.com/octo-owner/repo/pull/101";
    expect(renderStatusComment({ state: state() })).not.toContain("Draft PR");
    const shipped = renderStatusComment({
      state: state({ stage: "shipped", status: "done", prUrl: url, prNumber: 101 })
    });
    expect(shipped).toContain(`Draft PR: ${url}`);
  });

  it("starts with the marker and describes stage, timeline, loops and authorization", () => {
    const text = renderStatusComment({ state: state() });
    expect(text.startsWith(`${statusMarker(7)}\n`)).toBe(true);
    expect(text).toContain("Stage: `plan-gate` (waiting)");
    expect(text).toContain("Branch: `KAINE-7-feat-export-reports`");
    expect(text).toContain("- `intake`: done");
    expect(text).toContain("- `setup`: done");
    expect(text).toContain("- `plan`: done");
    expect(text).toContain("- `plan-gate`: waiting");
    expect(text).toContain("- `build`: pending");
    expect(text).toContain("- check: 1 of 3");
    expect(text).toContain("- review: 0 of 2");
    expect(text).toContain("Authorized by octo-owner through the `ready-for-agent` label");
    expect(text).toContain("intake-complete at `setup`: contract 6/6");
  });

  it("shows the needs-you reason on the stage it will resume", () => {
    const text = renderStatusComment({
      state: state({ stage: "needs-you", resumeStage: "build", status: "waiting" }),
      needsYouReason: "Three checks failed\nwith the same error"
    });
    expect(text).toContain("- `build`: needs you");
    expect(text).toContain("- `plan`: done");
    expect(text).toContain("### Needs you\nThree checks failed with the same error");
  });

  it("logs an override run", () => {
    const text = renderStatusComment({
      state: state({
        authorization: {
          actor: "octo-owner",
          labeledAt: "2026-10-07T09:00:00.000Z",
          contentFingerprint: "f",
          override: true
        }
      })
    });
    expect(text).toContain("owner override");
    expect(text).not.toContain("through the `ready-for-agent` label");
  });

  it("marks every stage done after shipping", () => {
    const text = renderStatusComment({ state: state({ stage: "shipped", status: "done" }) });
    expect(text).not.toContain(": pending");
    expect(text).toContain("- `ship`: done");
  });

  it("truncates a very long reason and carries no AI footer", () => {
    const text = renderStatusComment({
      state: state({ stage: "needs-you", resumeStage: "check" }),
      needsYouReason: "x".repeat(2000)
    });
    expect(text).toContain("...");
    expect(text.length).toBeLessThan(2000);
    expect(text).not.toMatch(/generated|claude|anthropic|co-authored/i);
  });

  it("uses custom loop limits", () => {
    expect(renderStatusComment({ state: state(), limits: { check: 5, review: 4 } })).toContain(
      "- check: 1 of 5"
    );
  });
});

const comment = (id: number, login: string, body: string) => ({ id, user: { login }, body });

const setup = (existing: ReturnType<typeof comment>[], extra: FakeRoute[] = []) => {
  const fake = fakeExec([
    ...extra,
    {
      argv: ["gh", "api", "repos/o/r/issues/7/comments?per_page=100&page=1"],
      reply: ok(JSON.stringify(existing))
    },
    { argv: ["gh", "api"], reply: ok(JSON.stringify(comment(99, "me", "x"))) }
  ]);
  return { fake, gh: createGhClient({ exec: fake.exec }) };
};

describe("upsertStatusComment", () => {
  const body = `${statusMarker(7)}\nStage: plan`;

  it("creates the comment when none exists", async () => {
    const { fake, gh } = setup([comment(1, "me", "unrelated")]);
    const result = await upsertStatusComment(gh, "o/r", "me", 7, body);
    expect(result).toEqual({ action: "created", commentId: 99 });
    const write = fake.calls.at(-1);
    expect(write?.argv.slice(0, 5)).toEqual([
      "gh",
      "api",
      "repos/o/r/issues/7/comments",
      "--method",
      "POST"
    ]);
    expect(write?.input).toBe(JSON.stringify({ body }));
  });

  it("edits its own comment in place", async () => {
    const { fake, gh } = setup([comment(5, "ME", `${statusMarker(7)}\nStage: intake`)]);
    const result = await upsertStatusComment(gh, "o/r", "me", 7, body);
    expect(result).toEqual({ action: "updated", commentId: 5 });
    expect(fake.calls.at(-1)?.argv.slice(2, 5)).toEqual([
      "repos/o/r/issues/comments/5",
      "--method",
      "PATCH"
    ]);
  });

  it("does nothing when the text is already current", async () => {
    const { fake, gh } = setup([comment(5, "me", body)]);
    expect(await upsertStatusComment(gh, "o/r", "me", 7, body)).toEqual({
      action: "unchanged",
      commentId: 5
    });
    expect(fake.calls).toHaveLength(1);
  });

  it("ignores a marker comment written by someone else", async () => {
    const { fake, gh } = setup([comment(5, "stranger", body)]);
    const result = await upsertStatusComment(gh, "o/r", "me", 7, body);
    expect(result.action).toBe("created");
    expect(fake.calls.at(-1)?.argv).toContain("POST");
  });

  it("refuses a body without its marker", async () => {
    const { gh } = setup([]);
    await expect(upsertStatusComment(gh, "o/r", "me", 7, "no marker")).rejects.toThrow("marker");
  });
});
