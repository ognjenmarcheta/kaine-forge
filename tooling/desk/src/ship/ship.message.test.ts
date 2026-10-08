import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCommitMessage,
  COMMIT_HEADER_MAX,
  commitInputFor,
  normalizeSubject,
  parseConventionalHeader
} from "./ship.message";
import { createExec } from "../ports";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** The repository's real commitlint config, run the way the commit-msg hook runs it. */
const commitlint = async (message: string) => {
  const result = await createExec()({
    argv: ["pnpm", "exec", "commitlint"],
    cwd: REPO_ROOT,
    input: message,
    timeoutMs: 60_000
  });
  return { ok: result.code === 0, output: `${result.stdout}${result.stderr}` };
};

describe("buildCommitMessage", () => {
  it("builds header, blank line, body and an issue reference", () => {
    const message = buildCommitMessage({
      type: "feat",
      scope: "desk",
      subject: "Add the ship library.",
      issue: 12,
      body: "The ship library commits, rebases, pushes and opens a draft PR."
    });
    expect(message.header).toBe("feat(desk): add the ship library");
    expect(message.text).toBe(
      [
        "feat(desk): add the ship library",
        "",
        "The ship library commits, rebases, pushes and opens a draft PR.",
        "",
        "Refs #12",
        ""
      ].join("\n")
    );
  });

  it("omits the scope and the body when absent", () => {
    expect(buildCommitMessage({ type: "docs", subject: "fix typo", issue: 3 }).text).toBe(
      "docs: fix typo\n\nRefs #3\n"
    );
  });

  it("lower-cases only the first letter and drops the final full stop", () => {
    expect(normalizeSubject("Fix the API timeout.", 90)).toBe("fix the API timeout");
  });

  it("cuts a long subject at a word so the header fits", () => {
    const subject = Array.from({ length: 40 }, () => "wording").join(" ");
    const { header } = buildCommitMessage({ type: "feat", scope: "desk", subject, issue: 1 });
    expect(header.length).toBeLessThanOrEqual(COMMIT_HEADER_MAX);
    expect(header.endsWith("wording")).toBe(true);
  });

  it("wraps a long body", () => {
    const body = Array.from({ length: 60 }, () => "word").join(" ");
    const lines = buildCommitMessage({ type: "fix", subject: "x", issue: 1, body }).text.split(
      "\n"
    );
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(88);
  });

  it("rejects bad input", () => {
    expect(() => buildCommitMessage({ type: "feat", subject: " . ", issue: 1 })).toThrow(/subject/);
    expect(() => buildCommitMessage({ type: "feat", subject: "x", issue: 0 })).toThrow(RangeError);
    expect(() =>
      buildCommitMessage({ type: "feat", scope: "Desk", subject: "x", issue: 1 })
    ).toThrow(/scope/);
    expect(() =>
      // @ts-expect-error The test passes a type that is not a Conventional Commit type.
      buildCommitMessage({ type: "wip", subject: "x", issue: 1 })
    ).toThrow();
  });
});

describe("commitInputFor", () => {
  const plan = {
    summary: "Add the ship library. It commits and opens a draft PR.",
    pr: { type: "feat" as const, slug: "agent-desk-ship" }
  };

  it("takes scope and subject from a Conventional Commit review title, and the type from the plan", () => {
    expect(
      commitInputFor({ plan, issue: 5, reviewTitle: "fix(api): Handle the empty case" })
    ).toMatchObject({ type: "feat", scope: "api", subject: "Handle the empty case", issue: 5 });
  });

  it("uses a plain review title as the subject", () => {
    expect(commitInputFor({ plan, issue: 5, reviewTitle: "Add ship library" })).toMatchObject({
      scope: undefined,
      subject: "Add ship library"
    });
  });

  it("does not read 'note: x' as a header", () => {
    expect(parseConventionalHeader("note: see below")).toBeNull();
    expect(parseConventionalHeader("feat(a-b): thing")).toEqual({
      type: "feat",
      scope: "a-b",
      subject: "thing"
    });
  });

  it("falls back to the plan summary, then to the slug", () => {
    expect(commitInputFor({ plan, issue: 5 }).subject).toBe("Add the ship library.");
    expect(commitInputFor({ plan: { ...plan, summary: "  " }, issue: 5 }).subject).toBe(
      "agent desk ship"
    );
  });

  it("ignores a scope that is not lower-case", () => {
    expect(
      commitInputFor({ plan, issue: 5, reviewTitle: "feat(Desk UI): x" }).scope
    ).toBeUndefined();
  });
});

describe("against the real commitlint config", () => {
  it("accepts the messages the builder produces", async () => {
    const messages = [
      buildCommitMessage({
        type: "feat",
        scope: "desk",
        subject: "Add the ship library",
        issue: 12
      }),
      buildCommitMessage({
        type: "fix",
        subject: "Handle the API timeout. Again.",
        issue: 99,
        body: `${"A long explanation of the change that needs wrapping. ".repeat(8)}`
      }),
      buildCommitMessage({
        type: "chore",
        scope: "tooling/desk",
        subject: Array.from({ length: 40 }, () => "wording").join(" "),
        issue: 1
      })
    ];
    for (const message of messages) {
      const result = await commitlint(message.text);
      expect(result, message.text).toMatchObject({ ok: true });
    }
  }, 120_000);

  it("rejects what it should, so the check above proves something", async () => {
    const result = await commitlint("Feat: Add the thing.\n");
    expect(result.ok).toBe(false);
  }, 60_000);

  it("rejects an AI co-author trailer through the repository plugin", async () => {
    const result = await commitlint(
      "feat: add a thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n"
    );
    expect(result.ok).toBe(false);
  }, 60_000);
});
