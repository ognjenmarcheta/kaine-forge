import { describe, expect, it } from "vitest";

import { formatContract, parseAcceptanceCriteria, parseContract } from "./github.contract";
import { BODY_WITH_CONTRACT } from "../testing/github.fake";

describe("parseContract", () => {
  it("finds all six headings in a ready-for-agent body", () => {
    const report = parseContract(BODY_WITH_CONTRACT);
    expect(report).toMatchObject({ found: 6, total: 6, missing: [] });
    expect(report.acceptanceCriteria).toEqual([
      "Export button downloads a CSV",
      "Empty reports say so"
    ]);
    expect(report.sections.scope).toBe("apps/web");
    expect(formatContract(report)).toBe("contract 6/6");
  });

  it("tolerates case, spacing, heading level, colons and question marks", () => {
    const report = parseContract(
      [
        "#### OUTCOME:",
        "a",
        "## acceptance   criteria ##",
        "- one",
        "# Out Of Scope?",
        "nothing"
      ].join("\n")
    );
    expect(report.missing).toEqual(["scope", "validation", "evidence"]);
    expect(report.acceptanceCriteria).toEqual(["one"]);
  });

  it("accepts the headings of the feature request template", () => {
    const report = parseContract(
      [
        "### Problem",
        "Gap",
        "### Proposed solution",
        "Change X",
        "### Acceptance criteria",
        "- Running X produces Y",
        "### Workspace or paths in scope",
        "apps/web",
        "### Validation tier",
        "Package/app code",
        "### Out of scope",
        "Docs"
      ].join("\n")
    );
    expect(report.found).toBe(5);
    expect(report.missing).toEqual(["evidence"]);
    expect(report.sections.outcome).toBe("Gap\n\nChange X");
  });

  it("accepts the headings of the bug report template", () => {
    const report = parseContract(
      [
        "### What happened?",
        "It crashes",
        "### Acceptance criteria",
        "- No crash",
        "### Affected workspace or area",
        "apps/api",
        "### Validation tier",
        "Package/app code",
        "### Environment",
        "macOS",
        "### Out of scope",
        "UI"
      ].join("\n")
    );
    expect(report.missing).toEqual(["outcome"]);
    expect(report.sections.evidence).toBe("It crashes");
  });

  it("counts a section with no content or _No response_ as missing", () => {
    const report = parseContract(
      ["### Outcome", "", "### Scope", "_No response_", "### Acceptance criteria", "- a"].join("\n")
    );
    expect(report.missing).toContain("outcome");
    expect(report.missing).toContain("scope");
    expect(report.found).toBe(1);
  });

  it("does not read headings inside fenced code", () => {
    const report = parseContract(
      ["### Evidence", "```sh", "### Scope", "# Outcome", "```", "text after fence"].join("\n")
    );
    expect(report.missing).not.toContain("evidence");
    expect(report.missing).toContain("scope");
    expect(report.sections.evidence).toContain("### Scope");
  });

  it("returns 0/6 for a body with no headings and reports the missing names", () => {
    const report = parseContract("Please fix the thing.");
    expect(report).toMatchObject({ found: 0, acceptanceCriteria: [] });
    expect(formatContract(report)).toContain("contract 0/6, missing: outcome");
  });

  it("handles Windows line endings", () => {
    const report = parseContract("### Acceptance criteria\r\n- a\r\n- b\r\n");
    expect(report.acceptanceCriteria).toEqual(["a", "b"]);
  });
});

describe("parseAcceptanceCriteria", () => {
  it("reads bullets, checklists and numbered items", () => {
    expect(parseAcceptanceCriteria("- [ ] one\n* [x] two\n+ three\n1. four\n2) five")).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five"
    ]);
  });

  it("joins an indented continuation to its bullet", () => {
    expect(parseAcceptanceCriteria("- first\n  continues here\n- second")).toEqual([
      "first continues here",
      "second"
    ]);
  });

  it("uses each non-empty line when there are no bullets", () => {
    expect(parseAcceptanceCriteria("Does A\n\nDoes B\n")).toEqual(["Does A", "Does B"]);
  });

  it("drops empty bullets", () => {
    expect(parseAcceptanceCriteria("- \n- real")).toEqual(["real"]);
  });
});
