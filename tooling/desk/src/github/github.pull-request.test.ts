import { describe, expect, it } from "vitest";

import { createGitHubPort } from "./github.port";
import { createPullRequestArgv } from "./github.pull-request";
import { fail, fakeExec, ok } from "../testing/exec.fake";

const portWith = (routes: Parameters<typeof fakeExec>[0]) => {
  const fake = fakeExec([...routes, { argv: ["gh"], reply: ok("") }]);
  return { fake, port: createGitHubPort({ exec: fake.exec, cwd: "/repo" }) };
};

const lastGh = (calls: readonly { argv: readonly string[] }[]): readonly string[] =>
  calls.at(-1)?.argv ?? [];

describe("findPullRequest", () => {
  it("lists open PRs for the head branch and returns the matching one", async () => {
    const { fake, port } = portWith([
      {
        argv: ["gh", "pr", "list"],
        reply: ok(
          JSON.stringify([
            { number: 3, url: "https://github.com/o/r/pull/3", headRefName: "other" },
            { number: 9, url: "https://github.com/o/r/pull/9", headRefName: "KAINE-7-feat-x" }
          ])
        )
      }
    ]);
    await expect(port.findPullRequest("KAINE-7-feat-x")).resolves.toEqual({
      number: 9,
      url: "https://github.com/o/r/pull/9"
    });
    expect(lastGh(fake.calls)).toEqual([
      "gh",
      "pr",
      "list",
      "--head",
      "KAINE-7-feat-x",
      "--state",
      "open",
      "--json",
      "number,url,headRefName",
      "--limit",
      "10"
    ]);
  });

  it("returns null when no PR matches", async () => {
    const { port } = portWith([{ argv: ["gh", "pr", "list"], reply: ok("[]") }]);
    await expect(port.findPullRequest("KAINE-7-feat-x")).resolves.toBeNull();
  });

  it("surfaces a gh failure", async () => {
    const { port } = portWith([{ argv: ["gh", "pr", "list"], reply: fail("HTTP 502") }]);
    await expect(port.findPullRequest("b")).rejects.toThrow("HTTP 502");
  });
});

describe("createPullRequest", () => {
  const request = {
    base: "main",
    head: "KAINE-7-feat-x",
    title: "feat: add x",
    bodyFile: "/state/pr-body.md",
    draft: true
  } as const;

  it("runs gh pr create with --draft and a body file, and reads the PR number from the URL", async () => {
    const { fake, port } = portWith([
      {
        argv: ["gh", "pr", "create"],
        reply: ok("Creating draft pull request...\nhttps://github.com/o/r/pull/12\n")
      }
    ]);
    await expect(port.createPullRequest(request)).resolves.toEqual({
      number: 12,
      url: "https://github.com/o/r/pull/12"
    });
    expect(lastGh(fake.calls)).toEqual([
      "gh",
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "KAINE-7-feat-x",
      "--draft",
      "--title",
      "feat: add x",
      "--body-file",
      "/state/pr-body.md"
    ]);
  });

  it("builds an argv that cannot merge, auto-merge or mark ready", () => {
    const argv = createPullRequestArgv(request);
    expect(argv).toContain("--draft");
    for (const word of argv) {
      expect(word).not.toMatch(/^--(merge|auto|squash|rebase|ready|admin)/);
    }
  });

  it("fails when gh prints no PR URL", async () => {
    const { port } = portWith([{ argv: ["gh", "pr", "create"], reply: ok("done\n") }]);
    await expect(port.createPullRequest(request)).rejects.toThrow(/no pull request URL/);
  });
});

describe("addPullRequestLabel", () => {
  it("edits the PR with --add-label only", async () => {
    const { fake, port } = portWith([]);
    await port.addPullRequestLabel(12, "release:skip-changeset");
    expect(lastGh(fake.calls)).toEqual([
      "gh",
      "pr",
      "edit",
      "12",
      "--add-label",
      "release:skip-changeset"
    ]);
  });

  it("surfaces a missing label", async () => {
    const { port } = portWith([
      { argv: ["gh", "pr", "edit"], reply: fail("could not add label: 'x' not found") }
    ]);
    await expect(port.addPullRequestLabel(12, "x")).rejects.toThrow(/not found/);
  });
});
