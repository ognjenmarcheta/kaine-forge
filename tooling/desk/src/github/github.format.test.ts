import { describe, expect, it } from "vitest";

import { parseContract } from "./github.contract";
import { renderIssueBody } from "./github.format";
import type { IntakeDraft } from "../contracts";

const DRAFT: IntakeDraft = {
  outcome: "pnpm audit passes without the node-forge exception.",
  acceptanceCriteria: [
    "GHSA-86w9-cpqp-85rv is gone from auditConfig.ignoreGhsas",
    "pnpm check passes"
  ],
  scope: "pnpm-workspace.yaml, pnpm-lock.yaml",
  validation: "pnpm audit --audit-level high, pnpm check",
  evidence: "pnpm-workspace.yaml:80",
  outOfScope: ["The Expo SDK pins"]
};

/** The old body of #457: real content under headings the desk does not know. */
const ORIGINAL = [
  "## Removal trigger and acceptance",
  "",
  "- Remove GHSA-86w9-cpqp-85rv from auditConfig.ignoreGhsas.",
  "",
  "## Acceptance criteria",
  "- an old criterion that must not count twice",
  "```",
  "## Scope",
  "```"
].join("\n");

describe("renderIssueBody", () => {
  it("gives a full contract with exactly the drafted criteria", () => {
    const report = parseContract(renderIssueBody(DRAFT, ORIGINAL));
    expect(report.missing).toEqual([]);
    expect(report.acceptanceCriteria).toEqual(DRAFT.acceptanceCriteria);
    expect(report.sections.scope).toBe("pnpm-workspace.yaml, pnpm-lock.yaml");
  });

  it("keeps every line of the original as a quote that no section reads", () => {
    const body = renderIssueBody(DRAFT, ORIGINAL);
    expect(body).toContain("## Original text");
    for (const line of ORIGINAL.split("\n").filter((entry) => entry !== "")) {
      expect(body).toContain(`> ${line}`);
    }
  });

  it("escapes drafted text that would open a heading or a fence", () => {
    const report = parseContract(
      renderIssueBody(
        { ...DRAFT, outcome: "Done.\n## Acceptance criteria\n- injected", evidence: "```\nx" },
        ""
      )
    );
    expect(report.acceptanceCriteria).toEqual(DRAFT.acceptanceCriteria);
    expect(report.sections.outcome).toContain("\\## Acceptance criteria");
    expect(report.missing).toEqual([]);
  });

  it("writes None for an empty list and one line per item", () => {
    const body = renderIssueBody({ ...DRAFT, outOfScope: [], acceptanceCriteria: ["a\nb"] }, "");
    expect(parseContract(body).sections["out-of-scope"]).toBe("None");
    expect(parseContract(body).acceptanceCriteria).toEqual(["a b"]);
    expect(body).not.toContain("Original text");
  });
});
