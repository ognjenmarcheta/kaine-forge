import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { deskConfigSchema, flowForLabels } from "../contracts";
import type { GhClient } from "./github.gh";
import {
  ciSummary,
  fetchOpenWork,
  toGithubLists,
  type OpenIssue,
  type OpenPull
} from "./github.lists";
import { makeState } from "../server/server.testing";
import type { IssueListEntry } from "../store/store.issue";

const AT = "2026-10-13T09:00:00.000Z";

/** Start picks the flow of the first listed label, else the default flow. */
const CONFIG = deskConfigSchema.parse({ flowLabels: { bug: "bug-fix", docs: "docs-only" } });
const flowFor = (labels: readonly string[]): string => flowForLabels(CONFIG, labels);

const issue = (over: Partial<OpenIssue> = {}): OpenIssue => ({
  number: 12,
  title: "Add a CSV export",
  url: "https://github.com/o/r/issues/12",
  labels: [],
  body: "",
  updatedAt: AT,
  ...over
});

const pull = (over: Partial<OpenPull> = {}): OpenPull => ({
  number: 40,
  title: "feat: export",
  url: "https://github.com/o/r/pull/40",
  isDraft: true,
  headRefName: "feature/export",
  headRefOid: "a".repeat(40),
  author: { login: "someone" },
  updatedAt: AT,
  statusCheckRollup: [],
  reviewDecision: "",
  labels: [],
  ...over
});

const onBoard = (issueNumber: number, prNumber: number | null = null): IssueListEntry => ({
  issueNumber,
  result: { status: "ok", state: makeState(issueNumber, { prNumber }) }
});

describe("toGithubLists", () => {
  it("marks ready issues, counts the contract, picks the flow by label, and keeps the body on the server", () => {
    const body = ["### Outcome", "a", "### Acceptance criteria", "- b"].join("\n");
    const lists = toGithubLists(
      {
        issues: [issue({ labels: [{ name: "ready-for-agent" }, { name: "bug" }], body })],
        pulls: []
      },
      [],
      AT,
      flowFor
    );
    expect(lists.issues).toEqual([
      {
        number: 12,
        title: "Add a CSV export",
        url: "https://github.com/o/r/issues/12",
        labels: ["ready-for-agent", "bug"],
        ready: true,
        contract: { found: 2, total: 6 },
        onBoard: false,
        flowId: "bug-fix",
        updatedAt: AT
      }
    ]);
    expect(JSON.stringify(lists)).not.toContain("Acceptance criteria");
  });

  it("marks an issue the desk already has", () => {
    const lists = toGithubLists({ issues: [issue()], pulls: [] }, [onBoard(12)], AT, flowFor);
    expect(lists.issues[0]).toMatchObject({ onBoard: true, flowId: "kaine-default" });
  });

  it.each([
    ["a pull request the desk shipped", pull({ number: 40 }), [onBoard(7, 40)], 7],
    ["a desk branch name", pull({ headRefName: "KAINE-31-feat-export" }), [], 31],
    ["any other branch", pull({ headRefName: "dependabot/npm/x" }), [], null]
  ] as const)("links %s to its desk issue", (_name, entry, entries, expected) => {
    const lists = toGithubLists({ issues: [], pulls: [entry] }, entries, AT, flowFor);
    expect(lists.pulls[0]).toMatchObject({ draft: true, author: "someone", issue: expected });
  });
});

describe("ciSummary", () => {
  const run = (status: string, conclusion: string) => ({ status, conclusion });
  it.each([
    ["no checks", [], { state: "none", failing: 0 }],
    [
      "all green or skipped",
      [run("COMPLETED", "SUCCESS"), run("COMPLETED", "SKIPPED")],
      { state: "passing", failing: 0 }
    ],
    [
      "one still running",
      [run("COMPLETED", "SUCCESS"), run("IN_PROGRESS", "")],
      { state: "running", failing: 0 }
    ],
    [
      "a failure while another runs",
      [run("COMPLETED", "FAILURE"), run("IN_PROGRESS", ""), run("COMPLETED", "TIMED_OUT")],
      { state: "failing", failing: 2 }
    ],
    ["a failed commit status", [{ state: "ERROR" }], { state: "failing", failing: 1 }]
  ] as const)("%s", (_name, rollup, expected) => {
    expect(ciSummary(rollup)).toEqual(expected);
  });
});

describe("a desk pull request", () => {
  it("carries its review state, its labels, and the issue's last check", () => {
    const check = {
      at: AT,
      headSha: "a".repeat(40),
      failingChecks: ["CI"],
      comments: 2,
      authors: ["coderabbitai[bot]"],
      skipped: []
    };
    const lists = toGithubLists(
      {
        issues: [],
        pulls: [
          pull({
            number: 40,
            reviewDecision: "CHANGES_REQUESTED",
            labels: [{ name: "source:scorecard" }]
          })
        ]
      },
      [
        {
          issueNumber: 7,
          result: { status: "ok", state: makeState(7, { prNumber: 40, prCheck: check }) }
        }
      ],
      AT,
      flowFor
    );
    expect(lists.pulls[0]).toMatchObject({
      issue: 7,
      review: "changes-requested",
      labels: ["source:scorecard"],
      check
    });

    // After a new push the check read an older head: it no longer counts.
    const pushed = toGithubLists(
      { issues: [], pulls: [pull({ number: 40, headRefOid: "b".repeat(40) })] },
      [
        {
          issueNumber: 7,
          result: { status: "ok", state: makeState(7, { prNumber: 40, prCheck: check }) }
        }
      ],
      AT,
      flowFor
    );
    expect(pushed.pulls[0]?.check).toBeNull();
  });
});

describe("fetchOpenWork", () => {
  it("lists only open issues and pull requests, with the fields it maps", async () => {
    const calls: (readonly string[])[] = [];
    const gh: GhClient = {
      text: () => Promise.reject(new Error("unused")),
      api: () => Promise.reject(new Error("unused")),
      apiPages: () => Promise.reject(new Error("unused")),
      json: <T>(schema: ZodType<T>, argv: readonly string[]) => {
        calls.push(argv);
        return Promise.resolve(schema.parse(argv[0] === "issue" ? [issue()] : [pull()]));
      }
    };

    const work = await fetchOpenWork(gh);

    expect(work.issues.map((entry) => entry.number)).toEqual([12]);
    expect(work.pulls.map((entry) => entry.number)).toEqual([40]);
    expect(calls.map((argv) => argv.slice(0, 4))).toEqual([
      ["issue", "list", "--state", "open"],
      ["pr", "list", "--state", "open"]
    ]);
  });
});
