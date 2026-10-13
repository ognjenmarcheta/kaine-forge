import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import type { GhClient } from "./github.gh";
import { fetchOpenWork, toGithubLists, type OpenIssue, type OpenPull } from "./github.lists";
import { makeState } from "../server/server.testing";
import type { IssueListEntry } from "../store/store.issue";

const AT = "2026-10-13T09:00:00.000Z";

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
  author: { login: "someone" },
  updatedAt: AT,
  ...over
});

const onBoard = (issueNumber: number, prNumber: number | null = null): IssueListEntry => ({
  issueNumber,
  result: { status: "ok", state: makeState(issueNumber, { prNumber }) }
});

describe("toGithubLists", () => {
  it("marks ready issues, counts the contract, and keeps the body on the server", () => {
    const body = ["### Outcome", "a", "### Acceptance criteria", "- b"].join("\n");
    const lists = toGithubLists(
      {
        issues: [issue({ labels: [{ name: "ready-for-agent" }, { name: "bug" }], body })],
        pulls: []
      },
      [],
      AT
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
        updatedAt: AT
      }
    ]);
    expect(JSON.stringify(lists)).not.toContain("Acceptance criteria");
  });

  it("marks an issue the desk already has", () => {
    const lists = toGithubLists({ issues: [issue()], pulls: [] }, [onBoard(12)], AT);
    expect(lists.issues[0]?.onBoard).toBe(true);
  });

  it.each([
    ["a pull request the desk shipped", pull({ number: 40 }), [onBoard(7, 40)], 7],
    ["a desk branch name", pull({ headRefName: "KAINE-31-feat-export" }), [], 31],
    ["any other branch", pull({ headRefName: "dependabot/npm/x" }), [], null]
  ] as const)("links %s to its desk issue", (_name, entry, entries, expected) => {
    const lists = toGithubLists({ issues: [], pulls: [entry] }, entries, AT);
    expect(lists.pulls[0]).toMatchObject({ draft: true, author: "someone", issue: expected });
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
