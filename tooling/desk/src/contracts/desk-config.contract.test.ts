import { describe, expect, it } from "vitest";

import { deskConfigSchema } from "./desk-config.contract";

describe("desk config contract", () => {
  it("fills every default from an empty object", () => {
    expect(deskConfigSchema.parse({})).toEqual({
      worktreesDir: null,
      copyIntoWorktree: [],
      checks: { loop: [["pnpm", "check:affected"]], ship: [["pnpm", "check"]] },
      maxTestLoops: 3,
      maxReviewLoops: 2,
      maxConcurrentAgents: 2,
      providers: { planner: "claude", builder: "claude", reviewer: "codex" },
      models: {},
      isolation: "host",
      docker: {
        agent: { memory: "6g", cpus: 4, pidsLimit: 1024 },
        check: { memory: "6g", cpus: 4, pidsLimit: 2048 },
        maxPatchBytes: 8 * 1024 * 1024,
        forwardEnv: []
      }
    });
  });

  it("accepts Docker limits, and forwards only a provider key by name", () => {
    const config = deskConfigSchema.parse({
      docker: { agent: { memory: "8g", cpus: 6 }, forwardEnv: ["ANTHROPIC_API_KEY"] }
    });
    expect(config.docker.agent).toEqual({ memory: "8g", cpus: 6, pidsLimit: 1024 });
    expect(config.docker.forwardEnv).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it.each([
    ["a GitHub token to forward", { docker: { forwardEnv: ["GH_TOKEN"] } }],
    ["a cloud key to forward", { docker: { forwardEnv: ["AWS_SECRET_ACCESS_KEY"] } }],
    ["a bad memory size", { docker: { agent: { memory: "lots" } } }],
    ["a zero memory size", { docker: { check: { memory: "0g" } } }],
    ["a pids limit that is too small", { docker: { agent: { pidsLimit: 4 } } }],
    ["a patch limit above 32 MiB", { docker: { maxPatchBytes: 64 * 1024 * 1024 } }],
    ["an unknown Docker key", { docker: { privileged: true } }]
  ])("rejects %s", (_name, input) => {
    expect(deskConfigSchema.safeParse(input).success).toBe(false);
  });

  it("keeps explicit values and fills the rest of a partial section", () => {
    const config = deskConfigSchema.parse({
      providers: { reviewer: "claude" },
      models: { planner: "opus" },
      notifyCommand: ["notify-send", "desk"],
      owner: "octo-cat",
      isolation: "docker"
    });
    expect(config.providers).toEqual({ planner: "claude", builder: "claude", reviewer: "claude" });
    expect(config.models).toEqual({ planner: "opus" });
    expect(config.notifyCommand).toEqual(["notify-send", "desk"]);
    expect(config.owner).toBe("octo-cat");
    expect(config.isolation).toBe("docker");
  });

  it("cuts a notify command line into an argv array without a shell", () => {
    const config = deskConfigSchema.parse({ notifyCommand: `osascript -e 'beep $HOME' x` });
    expect(config.notifyCommand).toEqual(["osascript", "-e", "beep $HOME", "x"]);
  });

  it.each([
    ["an unknown top-level key", { workTreesDir: "x" }],
    ["an unknown provider key", { providers: { tester: "claude" } }],
    ["an unknown provider", { providers: { planner: "gemini" } }],
    ["an unknown isolation", { isolation: "vm" }],
    ["a zero agent limit", { maxConcurrentAgents: 0 }],
    ["a fractional loop limit", { maxTestLoops: 1.5 }],
    ["an empty command", { checks: { loop: [[]] } }],
    ["an invalid owner", { owner: "not a login" }],
    ["a notify command line with an unclosed quote", { notifyCommand: "say 'hi" }],
    ["an empty notify command line", { notifyCommand: "  " }]
  ])("rejects %s", (_name, input) => {
    expect(deskConfigSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    "/etc/passwd",
    "../secrets",
    "a/../../b",
    "C:/secrets",
    "a\\b",
    "",
    ".",
    ".ai",
    ".ai/hooks/pre-tool-use.mjs",
    ".husky",
    ".git/config",
    ".claude/settings.json",
    ".ai.local/factory",
    ".ai.local/factory/runs/1"
  ])("refuses to copy %j into a worktree", (entry) => {
    expect(deskConfigSchema.safeParse({ copyIntoWorktree: [entry] }).success).toBe(false);
  });

  it.each([".env", ".ai.local/mcp.json", "apps/api/.env", ".aiignore"])(
    "allows copying %j into a worktree",
    (entry) => {
      expect(deskConfigSchema.safeParse({ copyIntoWorktree: [entry] }).success).toBe(true);
    }
  );
});
