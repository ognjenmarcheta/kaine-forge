import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  PROTECTED_EDIT_RULES,
  PermissionsPolicyError,
  buildRunSettings,
  parseReceipts,
  permissionsFor,
  readPolicyDenies
} from "./permissions";
import { isProtectedPath } from "../policy/protected-paths";

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const POLICY = {
  rules: [
    { id: "db-push", decision: "deny", command: "pnpm db:push", reason: "x" },
    { id: "git-no-verify", decision: "deny", command: "git", flag: "--no-verify", reason: "x" },
    { id: "db-migrate", decision: "ask", command: "pnpm db:migrate", reason: "x" },
    { id: "something-allowed", decision: "allow", command: "pnpm fine", reason: "x" }
  ]
};

const dirs: string[] = [];
const makeWorktree = async (options: { policy?: string | null; skills?: string[] } = {}) => {
  const dir = await mkdtemp(path.join(tmpdir(), "desk-perm-"));
  dirs.push(dir);
  await mkdir(path.join(dir, ".ai", "skills"), { recursive: true });
  if (options.policy !== null) {
    await writeFile(
      path.join(dir, ".ai", "permissions.json"),
      options.policy ?? JSON.stringify(POLICY)
    );
  }
  for (const skill of options.skills ?? ["kaine-write-plan", "kaine-new-ops"]) {
    await writeFile(path.join(dir, ".ai", "skills", `${skill}.md`), "# skill");
  }
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("readPolicyDenies", () => {
  it("turns deny and ask rules into Bash deny rules and leaves flag and allow rules out", async () => {
    const worktree = await makeWorktree();
    expect(await readPolicyDenies(worktree)).toEqual([
      "Bash(pnpm db:push)",
      "Bash(pnpm db:push *)",
      "Bash(pnpm db:migrate)",
      "Bash(pnpm db:migrate *)"
    ]);
  });

  it("raises a typed error when the policy file is missing", async () => {
    const worktree = await makeWorktree({ policy: null });
    await expect(readPolicyDenies(worktree)).rejects.toMatchObject({
      name: "PermissionsPolicyError",
      reason: "missing"
    });
  });

  it.each([
    ["not json", "{ nope"],
    ["no rules array", JSON.stringify({ rules: "x" })],
    ["a rule without a command", JSON.stringify({ rules: [{ id: "a", decision: "deny" }] })],
    [
      "an unknown decision",
      JSON.stringify({ rules: [{ id: "a", decision: "maybe", command: "x" }] })
    ]
  ])("raises a typed error for malformed policy: %s", async (_name, policy) => {
    const worktree = await makeWorktree({ policy });
    const error = await readPolicyDenies(worktree).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PermissionsPolicyError);
    expect(error).toMatchObject({ reason: "malformed" });
  });

  it("reads the real repository policy", async () => {
    const denies = await readPolicyDenies(REPO_ROOT);
    expect(denies).toContain("Bash(pnpm db:push)");
    expect(denies).toContain("Bash(gh pr merge *)");
    expect(denies).toContain("Bash(pnpm db:migrate)");
  });
});

describe("permissionsFor (claude)", () => {
  it("gives a planner read tools, read-only git, Serena read tools and its own skill", async () => {
    const worktree = await makeWorktree();
    const { allow } = await permissionsFor("planner", "claude", { worktree });
    expect(allow).toEqual(
      expect.arrayContaining([
        "Read",
        "Glob",
        "Grep",
        "Skill(skill:kaine-write-plan)",
        "Bash(git diff:*)",
        "Bash(git status:*)",
        "Bash(git log:*)",
        "Bash(git show:*)",
        "mcp__serena__find_symbol"
      ])
    );
    for (const forbidden of ["Edit", "Write"]) expect(allow).not.toContain(forbidden);
    expect(allow.some((rule) => rule.startsWith("Bash(pnpm"))).toBe(false);
    expect(allow.some((rule) => /write_memory|onboarding|replace_|insert_/.test(rule))).toBe(false);
  });

  it("never allows broad git", async () => {
    const worktree = await makeWorktree();
    for (const role of ["planner", "reviewer", "intake", "builder"] as const) {
      const { allow } = await permissionsFor(role, "claude", {
        worktree,
        workspaces: ["@repo/desk"]
      });
      const git = allow.filter((rule) => rule.startsWith("Bash(git"));
      expect(git.sort()).toEqual([
        "Bash(git diff:*)",
        "Bash(git log:*)",
        "Bash(git show:*)",
        "Bash(git status:*)"
      ]);
      expect(allow).not.toContain("Bash(git:*)");
      expect(allow).not.toContain("Bash(*)");
      expect(allow).not.toContain("Bash");
    }
  });

  it("gives a reviewer the same read-only set with its own skill", async () => {
    const worktree = await makeWorktree();
    const planner = await permissionsFor("planner", "claude", { worktree });
    const reviewer = await permissionsFor("reviewer", "claude", { worktree });
    expect(reviewer.allow).toContain("Skill(skill:kaine-review)");
    expect(reviewer.allow.filter((rule) => !rule.startsWith("Skill("))).toEqual(
      planner.allow.filter((rule) => !rule.startsWith("Skill("))
    );
  });

  it("gives a builder edit tools, generate, Serena edits and exact per-workspace scripts", async () => {
    const worktree = await makeWorktree();
    const { allow } = await permissionsFor("builder", "claude", {
      worktree,
      workspaces: ["@repo/api", "@repo/desk"]
    });
    expect(allow).toEqual(
      expect.arrayContaining([
        "Edit",
        "Write",
        "Skill(skill:kaine-test)",
        "Bash(pnpm generate:*)",
        "mcp__serena__replace_symbol_body",
        "Bash(pnpm --filter @repo/api test:*)",
        "Bash(pnpm --filter @repo/api typecheck:*)",
        "Bash(pnpm --filter @repo/api lint:*)",
        "Bash(pnpm --filter @repo/desk test:*)"
      ])
    );
    const pnpm = allow.filter((rule) => rule.startsWith("Bash(pnpm"));
    expect(pnpm).toHaveLength(7);
    for (const rule of pnpm.filter((entry) => entry.includes("--filter"))) {
      expect(rule).toMatch(/^Bash\(pnpm --filter @repo\/(api|desk) (test|typecheck|lint):\*\)$/);
    }
    for (const unsafe of ["pnpm exec", "pnpm dlx", "pnpm run", "pnpm install", "pnpm test"]) {
      expect(allow.some((rule) => rule.startsWith(`Bash(${unsafe}`))).toBe(false);
    }
  });

  it("gives a builder no pnpm script access without workspace names", async () => {
    const worktree = await makeWorktree();
    const { allow } = await permissionsFor("builder", "claude", { worktree });
    expect(allow.filter((rule) => rule.startsWith("Bash(pnpm"))).toEqual(["Bash(pnpm generate:*)"]);
  });

  it("grants create:feature only with the optional skill", async () => {
    const worktree = await makeWorktree();
    const plain = await permissionsFor("builder", "claude", { worktree });
    const crud = await permissionsFor("builder", "claude", {
      worktree,
      skills: ["kaine-test", "kaine-create-feature"]
    });
    expect(plain.allow).not.toContain("Bash(pnpm create:feature:*)");
    expect(crud.allow).toContain("Bash(pnpm create:feature:*)");
    expect(crud.disallow).not.toContain("Skill(skill:kaine-create-feature)");
  });

  it.each(["*", "@repo/api exec", "@repo/a;rm", "../x", ""])(
    "rejects the workspace name %j",
    async (name) => {
      const worktree = await makeWorktree();
      await expect(
        permissionsFor("builder", "claude", { worktree, workspaces: [name] })
      ).rejects.toMatchObject({ reason: "invalid-input" });
    }
  );

  it("denies the desk's forbidden commands, tools and Serena writes for every role", async () => {
    const worktree = await makeWorktree();
    for (const role of ["planner", "builder", "reviewer", "intake"] as const) {
      const { disallow } = await permissionsFor(role, "claude", { worktree });
      expect(disallow).toEqual(
        expect.arrayContaining([
          "Bash(pnpm db:push)",
          "Bash(pnpm db:migrate *)",
          "Bash(git commit:*)",
          "Bash(git push:*)",
          "Bash(git reset:*)",
          "Bash(git checkout:*)",
          "Bash(git rebase:*)",
          "Bash(git stash:*)",
          "Bash(git merge:*)",
          "Bash(git switch:*)",
          "Bash(gh:*)",
          "WebFetch",
          "WebSearch",
          "Bash(pnpm ai:install:*)",
          "Bash(pnpm release:apps:*)",
          "Bash(pnpm db:push:*)",
          "Bash(pnpm dev:*)",
          "mcp__serena__write_memory",
          "mcp__serena__onboarding"
        ])
      );
    }
  });

  it("denies every skill outside the role list, including skills found in the worktree", async () => {
    const worktree = await makeWorktree();
    const planner = await permissionsFor("planner", "claude", { worktree });
    expect(planner.disallow).toContain("Skill(skill:kaine-explain)");
    expect(planner.disallow).toContain("Skill(skill:kaine-summarize-work)");
    expect(planner.disallow).toContain("Skill(skill:kaine-open-pr)");
    expect(planner.disallow).toContain("Skill(skill:kaine-new-ops)");
    expect(planner.disallow).toContain("Skill(skill:kaine-test)");
    expect(planner.disallow).not.toContain("Skill(skill:kaine-write-plan)");
    const builder = await permissionsFor("builder", "claude", { worktree });
    expect(builder.disallow).toContain("Skill(skill:kaine-write-plan)");
    expect(builder.disallow).not.toContain("Skill(skill:kaine-test)");
  });

  it("denies edits to every protected area, and those areas match the protected-path policy", async () => {
    const worktree = await makeWorktree();
    const { disallow } = await permissionsFor("builder", "claude", { worktree });
    for (const rule of PROTECTED_EDIT_RULES) expect(disallow).toContain(rule);
    const samples: Record<string, string> = {
      ".git/**": ".git/config",
      ".claude/**": ".claude/settings.json",
      ".agents/**": ".agents/skills/x/SKILL.md",
      ".codex/**": ".codex/config.toml",
      ".cursor/**": ".cursor/rules/a.mdc",
      ".grok/**": ".grok/config.toml",
      ".opencode/**": ".opencode/a.json",
      ".husky/**": ".husky/pre-commit",
      ".ai/hooks/**": ".ai/hooks/pre-tool-use.mjs",
      ".ai/permissions.json": ".ai/permissions.json",
      ".ai.local/**": ".ai.local/x",
      ".mcp.json": ".mcp.json",
      ".serena/memories/**": ".serena/memories/a.md",
      ".github/workflows/**": ".github/workflows/ci.yml",
      "**/.env": "apps/api/.env",
      "**/.env.local": "apps/api/.env.local",
      "**/node_modules/**": "node_modules/x/index.js"
    };
    expect(
      Object.keys(samples)
        .map((glob) => `Edit(${glob})`)
        .sort()
    ).toEqual([...PROTECTED_EDIT_RULES].sort());
    for (const sample of Object.values(samples)) expect(isProtectedPath(sample)).toBe(true);
  });

  it("denies nothing that it also allows", async () => {
    const worktree = await makeWorktree();
    for (const role of ["planner", "builder", "reviewer"] as const) {
      const { allow, disallow } = await permissionsFor(role, "claude", {
        worktree,
        workspaces: ["@repo/desk"]
      });
      expect(allow.filter((rule) => disallow.includes(rule))).toEqual([]);
    }
  });

  it("fails with a typed error when the policy file is missing", async () => {
    const worktree = await makeWorktree({ policy: null });
    await expect(permissionsFor("planner", "claude", { worktree })).rejects.toBeInstanceOf(
      PermissionsPolicyError
    );
  });

  it("denies every real skill the repo ships that is outside the role list", async () => {
    const { readdirSync } = await import("node:fs");
    const real = readdirSync(path.join(REPO_ROOT, ".ai", "skills"))
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => entry.slice(0, -3));
    expect(real.length).toBeGreaterThan(10);
    const planner = await permissionsFor("planner", "claude", { worktree: REPO_ROOT });
    for (const skill of real.filter((name) => name !== "kaine-write-plan")) {
      expect(planner.disallow).toContain(`Skill(skill:${skill})`);
    }
  });
});

describe("permissionsFor (codex)", () => {
  it("returns a sandbox and no Claude rules", async () => {
    const worktree = await makeWorktree();
    expect(await permissionsFor("planner", "codex", { worktree })).toEqual({
      allow: [],
      disallow: [],
      sandbox: "read-only"
    });
    expect(await permissionsFor("reviewer", "codex", { worktree })).toMatchObject({
      sandbox: "read-only"
    });
    expect(await permissionsFor("builder", "codex", { worktree })).toMatchObject({
      sandbox: "workspace-write"
    });
  });
});

describe("buildRunSettings", () => {
  it("wires the repo PreToolUse hook and the receipt hook", () => {
    const settings = buildRunSettings({
      worktree: "/w/KAINE-1",
      receiptsPath: "/state/receipts.jsonl",
      receiptHookPath: "/desk/hooks/receipt.mjs"
    });
    expect(settings.hooks.PreToolUse).toEqual([
      {
        matcher: "^(Bash|PowerShell)$",
        hooks: [
          {
            type: "command",
            command: 'node "/w/KAINE-1/.ai/hooks/pre-tool-use.mjs" --agent claude',
            timeout: 10
          }
        ]
      }
    ]);
    expect(settings.hooks.PostToolUse).toEqual([
      {
        matcher: ".*",
        hooks: [
          {
            type: "command",
            command: 'node "/desk/hooks/receipt.mjs" "/state/receipts.jsonl"',
            timeout: 10
          }
        ]
      }
    ]);
  });

  it("points at hook files that exist", () => {
    const settings = buildRunSettings({ worktree: REPO_ROOT, receiptsPath: "/tmp/r.jsonl" });
    const commands = [...settings.hooks.PreToolUse, ...settings.hooks.PostToolUse].flatMap(
      (group) => group.hooks.map((hook) => hook.command)
    );
    const files = commands.map((command) => /^node "([^"]+)"/.exec(command)?.[1] ?? "");
    expect(files).toHaveLength(2);
    for (const file of files) expect(existsSync(file)).toBe(true);
  });

  it("refuses a path that cannot be quoted safely", () => {
    for (const bad of ['/w/a"b', "/w/$HOME", "/w/`x`", "/w/a\\b", "/w/a\nb"]) {
      expect(() => buildRunSettings({ worktree: bad, receiptsPath: "/r.jsonl" })).toThrow(
        PermissionsPolicyError
      );
      expect(() => buildRunSettings({ worktree: "/w", receiptsPath: bad })).toThrow(
        PermissionsPolicyError
      );
    }
  });

  it("is JSON that the repo's own hook enforces: db:push is denied through the wired script", async () => {
    const settings = buildRunSettings({ worktree: REPO_ROOT, receiptsPath: "/tmp/r.jsonl" });
    const command = settings.hooks.PreToolUse[0]?.hooks[0]?.command ?? "";
    const script = /^node "([^"]+)" --agent claude$/.exec(command)?.[1] ?? "";
    const child = run("node", [script, "--agent", "claude"]);
    child.child.stdin?.end(
      JSON.stringify({ tool_name: "Bash", tool_input: { command: "pnpm db:push" } })
    );
    const outcome = await child.catch((error: { code?: number; stdout?: string }) => error);
    expect(outcome).toMatchObject({ code: 2 });
    expect(String((outcome as { stdout?: string }).stdout)).toContain(
      '"permissionDecision":"deny"'
    );
  });
});

describe("parseReceipts", () => {
  it("keeps valid receipts and skips other lines", () => {
    expect(
      parseReceipts(
        [
          '{"tool":"Bash","command":"git status","ts":"2026-10-07T00:00:00.000Z"}',
          "not json",
          '{"nope":1}',
          ""
        ].join("\n")
      )
    ).toEqual([{ tool: "Bash", command: "git status", ts: "2026-10-07T00:00:00.000Z" }]);
  });
});
