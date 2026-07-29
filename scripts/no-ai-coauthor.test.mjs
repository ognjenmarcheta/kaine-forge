import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findAiCoauthorViolation } from "./no-ai-coauthor.mjs";

describe("findAiCoauthorViolation", () => {
  it("allows ordinary conventional commits", () => {
    assert.equal(findAiCoauthorViolation("feat(auth): add password reset"), null);
  });

  it("allows human Co-Authored-By trailers", () => {
    const message = [
      "fix: repair invite flow",
      "",
      "Co-Authored-By: Ada Lovelace <ada@example.com>"
    ].join("\n");
    assert.equal(findAiCoauthorViolation(message), null);
  });

  it("rejects Claude Co-Authored-By", () => {
    const message = ["feat: something", "", "Co-Authored-By: Claude <noreply@anthropic.com>"].join(
      "\n"
    );
    assert.match(findAiCoauthorViolation(message) ?? "", /AI co-author trailer/i);
  });

  it("rejects Cursor Co-Authored-By", () => {
    const message = "chore: tidy\n\nCo-Authored-By: Cursor <cursoragent@cursor.com>";
    assert.match(findAiCoauthorViolation(message) ?? "", /AI co-author trailer/i);
  });

  it("rejects Copilot Co-Authored-By case-insensitively", () => {
    const message = "docs: note\n\nco-authored-by: GitHub Copilot <copilot@github.com>";
    assert.match(findAiCoauthorViolation(message) ?? "", /AI co-author trailer/i);
  });

  it("rejects Generated with Claude footers", () => {
    const message = "fix: bug\n\nGenerated with Claude Code";
    assert.match(findAiCoauthorViolation(message) ?? "", /generator footer/i);
  });

  it("rejects robot generated footers", () => {
    const message = "fix: bug\n\n🤖 Generated";
    assert.match(findAiCoauthorViolation(message) ?? "", /generator footer/i);
  });

  it("allows empty or non-string input", () => {
    assert.equal(findAiCoauthorViolation(""), null);
    assert.equal(findAiCoauthorViolation(/** @type {any} */ (null)), null);
  });
});
