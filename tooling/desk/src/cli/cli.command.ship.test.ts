import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli, type CliDeps, type CliResult } from "./desk.cli";
import { createGitPort } from "../git";
import { SHIP_REPO_FILES } from "../ship/ship.testing";
import { CLI_NOW } from "../testing/cli.testing";
import { createOriginAndClone, createScratch, hermeticExec } from "../testing/git.repo";
import type { TestRepo, TestScratch } from "../testing/git.repo";
import { fakeGitHub, snapshotOf, type FakeGitHub } from "../testing/github.fake";
import {
  ISSUE,
  REPO_FILES,
  builderOutput,
  createFakePnpm,
  createScriptedRunner,
  planOutput,
  reviewOutput,
  writeFeature
} from "../testing/pipeline.testing";

/**
 * `pnpm desk ship` against real git: a local bare origin, real hooks, a scripted
 * agent, a scripted `pnpm`, and a fake GitHub. The CLI opens its own state in the
 * clone's git directory, so the whole run goes through `runCli`.
 */

// Real git, real hooks, and a full pipeline in one test. Process starts are slow on a loaded machine.
vi.setConfig({ testTimeout: 120_000 });

interface Harness {
  readonly scratch: TestScratch;
  readonly clone: TestRepo;
  readonly github: FakeGitHub;
  readonly run: (...argv: string[]) => Promise<CliResult>;
  readonly questions: string[];
  readonly answer: (value: boolean) => void;
  readonly issueDir: string;
}

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.scratch.cleanup();
  harness = null;
});

const open = async (): Promise<Harness> => {
  const scratch = await createScratch();
  const { clone } = await createOriginAndClone(scratch);
  const template = await readFile(
    path.resolve(import.meta.dirname, "../../../../.github/pull_request_template.md"),
    "utf8"
  );
  const files = {
    ...REPO_FILES,
    ...SHIP_REPO_FILES,
    ".github/pull_request_template.md": template
  };
  for (const [file, content] of Object.entries(files)) await clone.write(file, content);
  await clone.commit("add repo files");
  await clone.git(["push", "--quiet", "origin", "main"]);
  await clone.git(["config", "user.name", "Ognjen Test"]);
  await clone.git(["config", "user.email", "ognjen@example.test"]);
  const hook = path.join(clone.dir, ".git", "hooks", "pre-push");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, "#!/bin/sh\nexit 0\n");
  await chmod(hook, 0o755);

  const github = fakeGitHub({ snapshot: snapshotOf({ number: ISSUE }) });
  const pnpm = createFakePnpm(hermeticExec);
  const runner = createScriptedRunner([
    { role: "planner", output: planOutput() },
    { role: "builder", output: builderOutput(), effect: (run) => writeFeature(run) },
    { role: "reviewer", output: reviewOutput() }
  ]);
  const questions: string[] = [];
  let reply = false;
  const deps: CliDeps = {
    exec: pnpm.exec,
    clock: { now: () => CLI_NOW },
    cwd: clone.dir,
    nodeVersion: "v24.12.0",
    createGitHub: () => github,
    git: createGitPort(pnpm.exec),
    runnerFor: () => runner,
    pipeline: { lease: { processStart: () => Promise.resolve(null) } }
  };
  const ask: NonNullable<CliDeps["ask"]> = (question) => {
    questions.push(question);
    return Promise.resolve(reply);
  };
  return {
    scratch,
    clone,
    github,
    questions,
    answer: (value) => {
      reply = value;
    },
    // A `ask` that answers is only present for the calls that pass `terminal`.
    run: (...argv) => {
      const terminal = argv[0] === "terminal";
      return runCli(terminal ? argv.slice(1) : argv, terminal ? { ...deps, ask } : deps);
    },
    issueDir: path.join(clone.dir, ".git", "kaine-desk", "issues", String(ISSUE))
  };
};

const toPrReview = async (h: Harness): Promise<void> => {
  expect((await h.run("start", String(ISSUE))).code).toBe(0);
  expect((await h.run("approve", String(ISSUE))).stdout).toContain("stage pr-review");
};

const branches = async (h: Harness): Promise<string[]> =>
  (
    await h.clone.git(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      path.join(h.scratch.root, "origin.git")
    )
  )
    .split("\n")
    .filter((line) => line !== "");

describe("desk ship", () => {
  it("prints a dry run, refuses without a terminal, then ships after a yes at the prompt", async () => {
    harness = await open();
    const h = harness;
    await toPrReview(h);

    // No flag, no terminal: refused with exit 1.
    const refused = await h.run("ship", "7");
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("no terminal to ask");

    // The dry run prints the plan and changes nothing.
    const dry = await h.run("ship", "7", "--dry-run");
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("#7: ship dry run. Nothing was changed.");
    expect(dry.stdout).toContain("Gate: it would pass.");
    expect(dry.stdout).toContain('PR: draft against main, title "feat: export reports as CSV"');
    expect(dry.stdout).toContain("Files (2):\n  src/feature.test.ts\n  src/feature.ts");
    expect(dry.stdout).toContain("Changeset: none");
    expect(dry.stdout).toContain(path.join(h.issueDir, "artifacts", "pr-body.md"));
    const json = JSON.parse((await h.run("ship", "7", "--dry-run", "--json")).stdout);
    expect(json).toMatchObject({ ok: true, outcome: "dry-run", issue: 7 });
    expect(await branches(h)).toEqual(["main"]);
    expect(h.github.createdPullRequests).toEqual([]);

    // A no at the prompt ships nothing. A yes ships.
    h.answer(false);
    const declined = await h.run("terminal", "ship", "7");
    expect(declined.code).toBe(1);
    expect(h.github.createdPullRequests).toEqual([]);
    h.answer(true);
    const shipped = await h.run("terminal", "ship", "7");
    expect(h.questions).toEqual(["Ship #7 as a draft PR? [y/N] ", "Ship #7 as a draft PR? [y/N] "]);
    expect(shipped.code).toBe(0);
    expect(shipped.stdout).toContain("#7: shipped (stage shipped, done)");
    expect(shipped.stdout).toContain(
      "open the draft PR: https://github.com/octo-owner/repo/pull/101"
    );
    expect(shipped.stdout).toContain("merge it yourself on GitHub. The desk never merges.");
    expect(h.github.createdPullRequests).toHaveLength(1);
    expect(h.github.createdPullRequests[0]).toMatchObject({ draft: true, base: "main" });
    expect((await branches(h)).length).toBe(2);
  });

  it("ships with --confirm and prints one JSON result", async () => {
    harness = await open();
    const h = harness;
    await toPrReview(h);
    const result = await h.run("ship", "7", "--confirm", "--json");
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      outcome: "stopped",
      stop: "shipped",
      stage: "shipped",
      prUrl: "https://github.com/octo-owner/repo/pull/101"
    });
    expect(h.questions).toEqual([]);
    expect(h.github.createdPullRequests).toHaveLength(1);
  });
});
