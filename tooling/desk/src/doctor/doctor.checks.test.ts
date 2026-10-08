import { describe, expect, it } from "vitest";

import type { DeskConfigLoadResult } from "../config/config.load";
import { deskConfigSchema } from "../contracts";
import {
  REQUIRED_FLAGS,
  formatDoctorReport,
  helpMentions,
  missingFlags,
  runDoctor,
  type DoctorReport
} from "./doctor.checks";
import { fail, fakeExec, ok, type FakeRoute } from "../testing/exec.fake";
import { fakeGitHub } from "../testing/github.fake";

const CLAUDE_HELP = [
  "  --agents <json>                 JSON object defining custom agents",
  "  --json-schema <schema>          JSON Schema for structured output",
  "  --output-format <format>        Output format",
  "  --permission-mode <mode>        Permission mode",
  "  --permission-prompts <mode>     Prompt handling",
  "  -r, --resume [value]            Resume a conversation",
  "  --session-id <uuid>             Use a specific session ID",
  "  --setting-sources <sources>     Setting sources",
  "  --settings <file-or-json>       Load settings",
  "  --strict-mcp-config             Only use MCP servers from --mcp-config"
].join("\n");

const CODEX_HELP = [
  "Commands:",
  "  resume  Resume a previous session",
  "  review  Run a code review",
  "Options:",
  "  -s, --sandbox <MODE>      Sandbox policy",
  "  -C, --cd <DIR>            Working root",
  "      --ignore-user-config  Skip config.toml",
  "      --output-schema <FILE>  Output schema",
  "      --json                Print events as JSONL"
].join("\n");

const loaded =
  (config: Record<string, unknown> = {}, source: "defaults" | "file" = "defaults") =>
  (): Promise<DeskConfigLoadResult> =>
    Promise.resolve({ ok: true, config: deskConfigSchema.parse(config), source });

const healthy: FakeRoute[] = [
  { argv: ["pnpm", "--version"], reply: ok("10.29.3\n") },
  { argv: ["git", "--version"], reply: ok("git version 2.50.1\n") },
  { argv: ["git", "worktree", "list"], reply: ok("worktree /repo\n") },
  {
    argv: ["gh", "--version"],
    reply: ok("gh version 2.96.0 (2026-07-02)\nhttps://github.com/cli/cli\n")
  },
  { argv: ["claude", "--version"], reply: ok("2.1.282 (Claude Code)\n") },
  { argv: ["claude", "--help"], reply: ok(CLAUDE_HELP) },
  { argv: ["codex", "--version"], reply: ok("codex-cli 0.147.0\n") },
  { argv: ["codex", "exec", "--help"], reply: ok(CODEX_HELP) }
];

const run = (
  routes: FakeRoute[] = healthy,
  over: { nodeVersion?: string; load?: () => Promise<DeskConfigLoadResult>; viewer?: string } = {}
) => {
  const fake = fakeExec(routes);
  return {
    fake,
    report: runDoctor({
      exec: fake.exec,
      github: fakeGitHub({ viewer: over.viewer ?? "octo-owner" }),
      cwd: "/repo",
      nodeVersion: over.nodeVersion ?? "v24.12.0",
      loadConfig: over.load ?? loaded()
    })
  };
};

const statusOf = (report: DoctorReport, id: string) =>
  report.checks.find((check) => check.id === id)?.status;

describe("helpMentions", () => {
  it("does not mistake a longer flag for a shorter one", () => {
    expect(helpMentions("  --json-schema <schema>", "--json")).toBe(false);
    expect(helpMentions("  --setting-sources <s>", "--settings")).toBe(false);
    expect(helpMentions("  --settings <f>", "--settings")).toBe(true);
  });

  it("accepts either spelling and detects the resume subcommand", () => {
    expect(helpMentions("  -s, --sandbox <M>", "--sandbox|-s")).toBe(true);
    expect(helpMentions("  -s <M>", "--sandbox|-s")).toBe(true);
    expect(helpMentions("  resume  Resume", "resume")).toBe(true);
    expect(helpMentions("then resume later", "resume")).toBe(false);
  });

  it("reports the flags a help text lacks", () => {
    expect(missingFlags(CLAUDE_HELP, "claude")).toEqual([]);
    expect(missingFlags(CODEX_HELP, "codex")).toEqual([]);
    expect(missingFlags("", "claude")).toEqual([...REQUIRED_FLAGS.claude]);
    expect(missingFlags(CODEX_HELP.replace("--ignore-user-config", ""), "codex")).toEqual([
      "--ignore-user-config"
    ]);
  });
});

describe("runDoctor", () => {
  it("passes on a healthy machine and writes nothing", async () => {
    const { report, fake } = run();
    const result = await report;
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.status === "ok")).toBe(true);
    expect(result.checks.map((check) => check.id)).toEqual([
      "node",
      "pnpm",
      "git",
      "git-worktree",
      "gh",
      "gh-identity",
      "config",
      "claude",
      "claude-flags",
      "codex",
      "codex-flags"
    ]);
    // Only read-only probes ran.
    for (const call of fake.calls) {
      expect(call.argv.slice(0, 2)).not.toEqual(["git", "push"]);
      expect(call.argv).not.toContain("label");
    }
  });

  it("fails on an old Node", async () => {
    const result = await run(healthy, { nodeVersion: "v20.11.0" }).report;
    expect(statusOf(result, "node")).toBe("error");
    expect(result.ok).toBe(false);
  });

  it("fails when pnpm is missing", async () => {
    const result = await run([{ argv: ["pnpm"], reply: fail("not found", 127) }, ...healthy])
      .report;
    expect(statusOf(result, "pnpm")).toBe("error");
  });

  it("fails on a git without worktree support", async () => {
    const result = await run([
      { argv: ["git", "--version"], reply: ok("git version 2.3.0\n") },
      ...healthy
    ]).report;
    expect(statusOf(result, "git")).toBe("error");
    const failedList = await run([
      { argv: ["git", "worktree", "list"], reply: fail("fatal: not a git repository", 128) },
      ...healthy
    ]).report;
    expect(statusOf(failedList, "git-worktree")).toBe("error");
  });

  it("fails when gh is not installed", async () => {
    const result = await run([{ argv: ["gh", "--version"], reply: fail("", 127) }, ...healthy])
      .report;
    expect(statusOf(result, "gh")).toBe("error");
    expect(result.checks.find((check) => check.id === "gh-identity")).toBeUndefined();
  });

  it("fails when gh is signed in as someone other than the owner", async () => {
    const result = await run(healthy, { viewer: "stranger" }).report;
    expect(result.checks.find((check) => check.id === "gh-identity")).toMatchObject({
      status: "error",
      detail: expect.stringContaining("stranger")
    });
  });

  it("fails when the config is invalid", async () => {
    const result = await run(healthy, {
      load: () =>
        Promise.resolve({ ok: false, reason: "invalid-config", detail: "maxTestLoops: Too small" })
    }).report;
    expect(result.checks.find((check) => check.id === "config")).toMatchObject({
      status: "error",
      detail: expect.stringContaining("maxTestLoops")
    });
  });

  it("uses the owner from the config for the identity check", async () => {
    const result = await run(healthy, {
      load: loaded({ owner: "octo-owner" }, "file"),
      viewer: "octo-owner"
    }).report;
    expect(statusOf(result, "gh-identity")).toBe("ok");
    expect(result.checks.find((check) => check.id === "config")?.detail).toContain("config.json");
  });

  it("treats a missing provider as an error when a role needs it", async () => {
    // Defaults use claude for the planner and builder and codex for the reviewer.
    const result = await run([{ argv: ["codex"], reply: fail("not found", 127) }, ...healthy])
      .report;
    expect(statusOf(result, "codex")).toBe("error");
    expect(result.ok).toBe(false);
  });

  it("treats a missing provider as a warning when no role uses it", async () => {
    const result = await run([{ argv: ["codex"], reply: fail("not found", 127) }, ...healthy], {
      load: loaded({ providers: { planner: "claude", builder: "claude", reviewer: "claude" } })
    }).report;
    expect(statusOf(result, "codex")).toBe("warn");
    expect(result.ok).toBe(true);
    expect(formatDoctorReport(result)).toContain("with 1 warning");
  });

  it("reports the missing required flags of an installed provider", async () => {
    const stripped = CLAUDE_HELP.replace(/.*--permission-prompts.*\n/, "");
    const result = await run([{ argv: ["claude", "--help"], reply: ok(stripped) }, ...healthy])
      .report;
    expect(result.checks.find((check) => check.id === "claude-flags")).toMatchObject({
      status: "error",
      detail: expect.stringContaining("--permission-prompts")
    });
  });

  it("downgrades flag problems of an unused provider to a warning", async () => {
    const result = await run(
      [{ argv: ["codex", "exec", "--help"], reply: ok("Usage: codex exec") }, ...healthy],
      {
        load: loaded({ providers: { planner: "claude", builder: "claude", reviewer: "claude" } })
      }
    ).report;
    expect(statusOf(result, "codex-flags")).toBe("warn");
  });

  it("treats every provider as required when the config is invalid", async () => {
    const result = await run([{ argv: ["codex"], reply: fail("", 127) }, ...healthy], {
      load: () => Promise.resolve({ ok: false, reason: "invalid-json", detail: "x" })
    }).report;
    expect(statusOf(result, "codex")).toBe("error");
  });
});

describe("formatDoctorReport", () => {
  it("prints a row per check and a summary line", async () => {
    const text = formatDoctorReport(await run().report);
    expect(text.split("\n")[0]).toMatch(/^ok\s+Node\.js\s+v24\.12\.0$/);
    expect(text).toContain("Doctor passed.");
  });

  it("counts the problems", async () => {
    const text = formatDoctorReport(await run(healthy, { nodeVersion: "v18.0.0" }).report);
    expect(text).toContain("FAIL");
    expect(text).toContain("Doctor found 1 problem(s).");
  });
});
