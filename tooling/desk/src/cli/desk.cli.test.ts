import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "./desk.cli";
import { createCliEnv, type CliEnv, type CliEnvOptions } from "../testing/cli.testing";
import { fail, fakeExec, ok, type FakeRoute } from "../testing/exec.fake";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});
const open = async (options: CliEnvOptions = {}): Promise<CliEnv> => {
  env = await createCliEnv(options);
  return env;
};

const COMMANDS = [
  "start",
  "approve",
  "feedback",
  "continue",
  "cancel",
  "remove",
  "ship",
  "status",
  "logs",
  "resume",
  "labels sync",
  "doctor",
  "docker",
  "serve"
];

describe("help and routing", () => {
  it.each([[["--help"]], [["-h"]], [[]], [["--", "--help"]]])(
    "prints usage and exits 0 for %j",
    async (argv) => {
      const e = await open();
      const result = await e.run(...argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage: pnpm desk <command>");
      for (const command of COMMANDS) expect(result.stdout).toContain(command);
      expect(result.stdout).toContain("Exit codes: 0 at a gate or done, 1 needs you");
      expect(result.stderr).toBe("");
    }
  );

  it("exits 2 with usage for an unknown command, including an inherited property name", async () => {
    const e = await open();
    for (const name of ["frobnicate", "constructor", "toString"]) {
      const result = await e.run(name);
      expect(result).toMatchObject({ code: 2, stdout: "" });
      expect(result.stderr).toContain(`Unknown command '${name}'`);
    }
  });

  it.each([
    [["start"]],
    [["start", "abc"]],
    [["start", "0"]],
    [["start", "7", "8"]],
    [["start", "7", "--bogus"]],
    [["approve"]],
    [["cancel", "1", "2"]],
    [["ship", "x"]],
    [["ship", "7", "--confirm", "--dry-run"]],
    [["serve", "--port", "abc"]],
    [["serve", "--port", "70000"]],
    [["serve", "extra"]],
    [["labels"]],
    [["labels", "sync", "--force"]],
    [["doctor", "extra"]]
  ])("exits 2 for bad arguments %j", async (argv) => {
    const e = await open();
    const result = await e.run(...argv);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it.each([["status"], ["logs", "7"], ["resume", "7"], ["approve", "7"], ["remove", "7"]])(
    "reports a directory that is not a git repository as a failure for %s",
    async (...argv) => {
      const e = await open({
        deps: {
          exec: fakeExec([{ argv: ["git"], reply: fail("fatal: not a git repository", 128) }]).exec
        }
      });
      const result = await e.run(...argv);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("not a git repository");
    }
  );
});

describe("labels sync", () => {
  it("prints the gh label create commands and runs nothing by default", async () => {
    const e = await open();
    const callsBefore = e.extraCalls.length;
    const result = await e.run("labels", "sync");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run");
    expect(result.stdout.match(/gh label create agent:/g)).toHaveLength(3);
    expect(result.stdout).toContain("--apply");
    expect(e.github.createdLabels).toEqual([]);
    expect(e.extraCalls).toHaveLength(callsBefore);
  });

  it("creates the three labels only with --apply", async () => {
    const e = await open();
    const result = await e.run("labels", "sync", "--apply");
    expect(result.code).toBe(0);
    expect(e.github.createdLabels.map((label) => label.name)).toEqual([
      "agent:working",
      "agent:needs-you",
      "agent:pr-open"
    ]);
    expect(result.stdout).toContain("ok agent:working");
  });

  it("exits 1 when a label cannot be created", async () => {
    const e = await open();
    const result = await runCli(["labels", "sync", "--apply"], {
      ...e.deps,
      createGitHub: () => ({
        ...e.github,
        createLabel: () => Promise.reject(new Error("HTTP 403"))
      })
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("failed agent:working: HTTP 403");
  });
});

describe("doctor", () => {
  const healthy: FakeRoute[] = [
    { argv: ["pnpm", "--version"], reply: ok("10.29.3\n") },
    { argv: ["git", "--version"], reply: ok("git version 2.50.1\n") },
    { argv: ["git", "worktree", "list"], reply: ok("worktree /repo\n") },
    { argv: ["gh", "--version"], reply: ok("gh version 2.96.0\n") },
    { argv: ["claude", "--version"], reply: ok("2.1.282\n") },
    {
      argv: ["claude", "--help"],
      reply: ok(
        "--agents --json-schema --output-format --permission-mode --permission-prompts --resume --session-id --setting-sources --settings --strict-mcp-config"
          .split(" ")
          .map((flag) => `  ${flag}`)
          .join("\n")
      )
    },
    { argv: ["codex", "--version"], reply: ok("codex-cli 0.147.0\n") },
    {
      argv: ["codex", "exec", "--help"],
      reply: ok(
        "  resume\n  -s, --sandbox\n  -C, --cd\n  --ignore-user-config\n  --output-schema\n  --json\n"
      )
    }
  ];

  it("prints a table and exits 0 when healthy", async () => {
    const result = await (await open({ routes: healthy })).run("doctor");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Doctor passed.");
  });

  it("prints JSON with --json", async () => {
    const report = JSON.parse(
      (await (await open({ routes: healthy })).run("doctor", "--json")).stdout
    );
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThan(5);
  });

  it("exits 1 when a check fails", async () => {
    const result = await (
      await open({ routes: healthy, github: { viewer: "stranger" } })
    ).run("doctor");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("FAIL");
  });
});
