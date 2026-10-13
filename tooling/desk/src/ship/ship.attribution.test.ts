import { describe, expect, it } from "vitest";

import {
  findAiCoauthorViolation,
  findAttributionViolations,
  isAiIdentity
} from "./ship.attribution";

// The cases mirror scripts/no-ai-coauthor.mjs and its commitlint wiring.
describe("findAiCoauthorViolation", () => {
  it("passes an empty message and a clean message", () => {
    expect(findAiCoauthorViolation("")).toBeNull();
    expect(findAiCoauthorViolation("feat(desk): add ship library\n\nRefs #7")).toBeNull();
  });

  it.each([
    "Co-Authored-By: Claude <noreply@anthropic.com>",
    "co-authored-by: Cursor Agent <cursoragent@cursor.com>",
    "Co-Authored-By: GitHub Copilot <copilot@github.com>",
    "Co-Authored-By: ChatGPT <bot@openai.com>",
    "  Co-Authored-By: Codex CLI <codex@example.test>",
    "Co-Authored-By: someone <12345+claude@users.noreply.github.com>"
  ])("blocks the AI co-author trailer %s", (trailer) => {
    expect(findAiCoauthorViolation(`fix: thing\n\n${trailer}`)).toMatch(/AI co-author/);
  });

  it("allows a human co-author", () => {
    expect(
      findAiCoauthorViolation("fix: thing\n\nCo-Authored-By: Ada Lovelace <ada@example.test>")
    ).toBeNull();
  });

  it("does not flag an AI name outside a co-author trailer", () => {
    expect(findAiCoauthorViolation("docs: explain the claude runner flags")).toBeNull();
  });

  it.each([
    "Generated with Claude Code",
    "Made with Cursor",
    "made-with Copilot",
    "\u{1F916} Generated with some tool"
  ])("blocks the generator footer %s", (footer) => {
    expect(findAiCoauthorViolation(`fix: thing\n\n${footer}`)).toMatch(/footers/);
  });

  it("handles CRLF line endings", () => {
    expect(findAiCoauthorViolation("fix: thing\r\n\r\nCo-Authored-By: Claude <a@b.c>")).toMatch(
      /AI co-author/
    );
  });
});

describe("findAttributionViolations", () => {
  it("names the text that carries the violation", () => {
    const violations = findAttributionViolations({
      "commit-message": "feat: add x",
      "pr-title": "feat: add x",
      "pr-body": "Summary\n\nGenerated with Claude Code",
      changeset: null
    });
    expect(violations.map((violation) => violation.source)).toEqual(["pr-body"]);
  });

  it("checks the changeset text and skips absent texts", () => {
    const violations = findAttributionViolations({
      "commit-message": null,
      "pr-title": null,
      "pr-body": null,
      changeset: "Add x.\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
    });
    expect(violations.map((violation) => violation.source)).toEqual(["changeset"]);
  });
});

describe("isAiIdentity", () => {
  it("flags AI names and AI emails, not people", () => {
    expect(isAiIdentity("Claude", "x@example.test")).toBe(true);
    expect(isAiIdentity("Dev", "noreply@anthropic.com")).toBe(true);
    expect(isAiIdentity("Cursor Agent", "cursoragent@cursor.com")).toBe(true);
    expect(isAiIdentity("Ognjen Marceta", "ognjen@example.test")).toBe(false);
  });
});
