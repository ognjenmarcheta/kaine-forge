import { describe, expect, it } from "vitest";

import {
  builderOutputSchema,
  plannerOutputSchema,
  type BuilderOutput,
  type PlannerOutput
} from "../contracts";
import type { AgentDenial, AgentEvent } from "./agent.runner";
import { forbiddenCommandReason, verifyAgentRun, type ViolationKind } from "./agent.verify";
import { parseClaudeStream } from "./claude.stream";
import { parseCodexStream } from "./codex.stream";
import type { Receipt } from "./permissions";
import { baseRequest, fixtureLines, requestFor, resultFor } from "../testing/agent.testing";

const kinds = (violations: readonly { kind: ViolationKind }[]): ViolationKind[] =>
  violations.map((violation) => violation.kind);

const bashCall = (id: string, command: string): AgentEvent => ({
  type: "tool_call",
  id,
  tool: "Bash",
  command,
  paths: []
});
const skillCall = (id: string, skill: string): AgentEvent => ({
  type: "tool_call",
  id,
  tool: "Skill",
  skill,
  paths: []
});

const probe = { word: "w", overrideSeen: true };

const validBuilder = (claimedChecks: BuilderOutput["claimedChecks"] = []): BuilderOutput => ({
  summary: "s",
  filesChanged: [],
  notes: [],
  blockers: [],
  claimedChecks,
  plainLanguage: "p"
});
const builderRequest = requestFor(builderOutputSchema, { role: "builder" });

describe("skill evidence", () => {
  it("accepts a Skill tool call recorded from a real Claude run", () => {
    const summary = parseClaudeStream(fixtureLines("claude-structured.jsonl"));
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "planner", skills: ["probe-skill"], skillMode: "invoke" }),
      result: resultFor(probe, summary.events, summary.denials)
    });
    expect(verdict).toEqual({ ok: true, violations: [] });
  });

  it("reports a skill that the run never used", () => {
    const summary = parseClaudeStream(fixtureLines("claude-structured.jsonl"));
    const verdict = verifyAgentRun({
      request: baseRequest({
        role: "planner",
        skills: ["probe-skill", "kaine-write-plan"],
        skillMode: "invoke"
      }),
      result: resultFor(probe, summary.events)
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.violations).toEqual([
      expect.objectContaining({
        kind: "skill-not-used",
        message: expect.stringContaining("kaine-write-plan")
      })
    ]);
  });

  it("does not count a prose mention of the skill", () => {
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "planner", skills: ["kaine-write-plan"], skillMode: "invoke" }),
      result: resultFor(probe, [{ type: "text", text: "I used the kaine-write-plan skill." }])
    });
    expect(kinds(verdict.violations)).toEqual(["skill-not-used"]);
  });

  it("does not count a Skill call that was denied", () => {
    const denial: AgentDenial = { tool: "Skill", toolUseId: "s1", paths: [] };
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "planner", skills: ["kaine-write-plan"], skillMode: "invoke" }),
      result: resultFor(probe, [skillCall("s1", "kaine-write-plan")], [denial])
    });
    expect(kinds(verdict.violations)).toEqual(["skill-not-used", "permission-denied"]);
  });

  it.each([
    [
      "a Read of the installed skill",
      {
        type: "tool_call",
        id: "r",
        tool: "Read",
        paths: ["/w/.claude/skills/kaine-test/SKILL.md"]
      } as const
    ],
    [
      "a Read of the canonical skill",
      { type: "tool_call", id: "r", tool: "Read", paths: ["/w/.ai/skills/kaine-test.md"] } as const
    ],
    ["a Bash read", bashCall("b", "cat .claude/skills/kaine-test/SKILL.md")],
    ["a namespaced Skill call", skillCall("n", "desk:kaine-test")]
  ])("accepts %s", (_name, call) => {
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "planner", skills: ["kaine-test"], skillMode: "invoke" }),
      result: resultFor(probe, [call])
    });
    expect(verdict.violations).toEqual([]);
  });

  it("accepts a Codex read of .agents/skills/<name>/SKILL.md from a recorded run", () => {
    const summary = parseCodexStream(fixtureLines("codex-skill-read.jsonl"));
    const verdict = verifyAgentRun({
      request: baseRequest({
        role: "planner",
        provider: "codex",
        skills: ["probe-skill"],
        skillMode: "invoke"
      }),
      result: resultFor(probe, summary.events)
    });
    expect(verdict.violations).toEqual([]);
  });

  it("reports a Codex run that never read the skill", () => {
    const summary = parseCodexStream(fixtureLines("codex-commit-denied.jsonl"));
    const verdict = verifyAgentRun({
      request: baseRequest({
        role: "planner",
        provider: "codex",
        skills: ["probe-skill"],
        skillMode: "invoke"
      }),
      result: resultFor(probe, summary.events)
    });
    expect(kinds(verdict.violations)).toEqual(["skill-not-used"]);
  });

  it("skips skill evidence in inline mode", () => {
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "planner", skills: ["kaine-write-plan"], skillMode: "inline" }),
      result: resultFor(probe, [])
    });
    expect(verdict.ok).toBe(true);
  });

  it("reports a skill outside the role list, also in inline mode", () => {
    for (const skillMode of ["invoke", "inline"] as const) {
      const verdict = verifyAgentRun({
        request: baseRequest({ role: "planner", skills: ["kaine-write-plan"], skillMode }),
        result: resultFor(probe, [
          skillCall("a", "kaine-write-plan"),
          skillCall("b", "kaine-explain")
        ])
      });
      expect(verdict.violations).toEqual([
        expect.objectContaining({
          kind: "skill-out-of-scope",
          message: expect.stringContaining("kaine-explain")
        })
      ]);
    }
  });
});

describe("forbiddenCommandReason", () => {
  it.each([
    ["git commit -m x", "git commit"],
    ["git push origin HEAD", "git push"],
    ["git -C . -c user.name=t -c user.email=t@t commit --allow-empty -m x", "git commit"],
    ['git -c user.name="a b" commit -m x', "git commit"],
    ["/usr/bin/git reset --hard HEAD~1", "git reset"],
    ["git checkout -b other", "git checkout"],
    ["git switch main", "git switch"],
    ["git rebase main", "git rebase"],
    ["git stash", "git stash"],
    ["git merge main", "git merge"],
    ["git branch new-name", "git branch"],
    ["git tag v1", "git tag"],
    ["git config user.name x", "git config"],
    ["git status && git commit -m x", "git commit"],
    ["cd sub; git push", "git push"],
    ["echo $(git commit -m x)", "git commit"],
    ["env GIT_AUTHOR_NAME=a git commit -m x", "git commit"],
    ["bash -lc 'git commit -m x'", "git commit"],
    ['/bin/zsh -c "git push"', "git push"],
    ["git diff --no-verify", "git --no-verify"],
    ["gh pr create --draft", "gh"],
    ["gh issue view 1", "gh"],
    ["env GH_TOKEN=x gh api user", "gh"],
    ["pnpm ai:install --agent claude", "pnpm ai:install"],
    ["pnpm run ai:doctor", "pnpm ai:doctor"],
    ["pnpm --filter @repo/db db:push", "pnpm db:push"],
    ["pnpm release:apps --dry-run", "pnpm release:apps"]
  ])("flags %s", (command, reason) => {
    expect(forbiddenCommandReason(command)).toBe(reason);
  });

  it.each([
    "git status --short",
    "git diff HEAD~1 -- commit.ts",
    "git log --grep=commit --oneline",
    "git show HEAD:README.md",
    "git branch --show-current",
    "git branch",
    "git tag -l",
    "git remote -v",
    "git config --get user.name",
    "git stash list",
    "git worktree list",
    "echo 'git commit'",
    "grep -rn 'git push' docs",
    "pnpm --filter @repo/desk test",
    "pnpm generate",
    "cat .git/HEAD",
    "ls /bin | grep gh"
  ])("allows %s", (command) => {
    expect(forbiddenCommandReason(command)).toBeNull();
  });
});

describe("forbidden attempts and denials", () => {
  it("reports a bypass-form commit attempt even though the CLI denied it", () => {
    const summary = parseClaudeStream(fixtureLines("claude-commit-bypass-denied.jsonl"));
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "reviewer" }),
      result: resultFor(probe, summary.events, summary.denials)
    });
    expect(kinds(verdict.violations)).toEqual(
      expect.arrayContaining(["forbidden-command-attempted", "permission-denied"])
    );
    expect(
      verdict.violations.find((v) => v.kind === "forbidden-command-attempted")?.message
    ).toContain("git commit");
  });

  it("lists denials from a hook and from dontAsk", () => {
    for (const [name, expected] of [
      ["claude-hook-denied.jsonl", "echo secret-deny"],
      ["claude-dontask-denied.jsonl", "touch wrote.txt"]
    ] as const) {
      const summary = parseClaudeStream(fixtureLines(name));
      const verdict = verifyAgentRun({
        request: baseRequest({ role: "planner" }),
        result: resultFor(probe, summary.events, summary.denials)
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.violations.map((v) => v.message).join("\n")).toContain(expected);
      expect(kinds(verdict.violations).every((kind) => kind === "permission-denied")).toBe(true);
    }
  });

  it("reports a Serena memory write", () => {
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(validBuilder(), [
        { type: "tool_call", id: "m", tool: "mcp__serena__write_memory", paths: [] }
      ])
    });
    expect(kinds(verdict.violations)).toEqual(["forbidden-command-attempted"]);
  });

  it("passes a clean read-only run", () => {
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "reviewer" }),
      result: resultFor(probe, [bashCall("a", "git diff --stat"), bashCall("b", "git status")])
    });
    expect(verdict).toEqual({ ok: true, violations: [] });
  });
});

describe("builder claimed checks", () => {
  const builder = validBuilder;

  it("accepts a claim backed by an observed command, by normalised prefix", () => {
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(
        builder([
          { command: "pnpm --filter @repo/desk test", result: "pass" },
          { command: "pnpm  --filter @repo/desk   typecheck", result: "fail" },
          { command: "pnpm generate", result: "pass" }
        ]),
        [
          bashCall("1", "cd /w && pnpm --filter @repo/desk test -- --run 2>&1 | tail -20"),
          bashCall("2", "pnpm --filter @repo/desk typecheck"),
          bashCall("3", "FORCE_COLOR=0 pnpm generate")
        ]
      )
    });
    expect(verdict.violations).toEqual([]);
  });

  it("reports a claim with no matching command", () => {
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(builder([{ command: "pnpm --filter @repo/api test", result: "pass" }]), [
        bashCall("1", "pnpm --filter @repo/desk test")
      ])
    });
    expect(verdict.violations).toEqual([
      expect.objectContaining({
        kind: "claimed-check-not-run",
        message: expect.stringContaining("@repo/api test")
      })
    ]);
  });

  it("does not take a prefix of a longer word as a match", () => {
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(builder([{ command: "pnpm test", result: "pass" }]), [
        bashCall("1", "pnpm testing")
      ])
    });
    expect(kinds(verdict.violations)).toEqual(["claimed-check-not-run"]);
  });

  it("does not count a denied command, and needs no evidence for not-run", () => {
    const denial: AgentDenial = { tool: "Bash", toolUseId: "1", command: "pnpm test", paths: [] };
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(
        builder([
          { command: "pnpm test", result: "pass" },
          { command: "pnpm lint", result: "not-run" }
        ]),
        [bashCall("1", "pnpm test")],
        [denial]
      )
    });
    expect(kinds(verdict.violations)).toEqual(["permission-denied", "claimed-check-not-run"]);
  });

  it("accepts a command seen only in the hook receipts", () => {
    const receipts: Receipt[] = [
      { tool: "Bash", command: "pnpm --filter @repo/desk lint", ts: "2026-10-07T00:00:00.000Z" }
    ];
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(builder([{ command: "pnpm --filter @repo/desk lint", result: "pass" }])),
      receipts
    });
    expect(verdict.violations).toEqual([]);
  });

  it("reports a builder result that does not match the builder schema", () => {
    const loose = requestFor(builderOutputSchema.partial(), { role: "builder" });
    const verdict = verifyAgentRun({ request: loose, result: resultFor({ summary: "s" }) });
    expect(kinds(verdict.violations)).toEqual(["schema"]);
  });

  it("does not check claims for other roles", () => {
    const verdict = verifyAgentRun({
      request: baseRequest({ role: "reviewer" }),
      result: resultFor(probe, [])
    });
    expect(verdict.ok).toBe(true);
  });
});

describe("scope, protected paths and refs", () => {
  const plan: PlannerOutput = plannerOutputSchema.parse({
    summary: "s",
    files: [{ path: "apps/api/src/a.ts", action: "modify", purpose: "p" }],
    tests: [{ path: "apps/api/src/a.test.ts", action: "create", reason: "r" }],
    acceptanceCriteria: [],
    risks: [],
    openQuestions: [],
    changeset: { required: false, packages: [], bump: "patch" },
    pr: { type: "feat", slug: "x" },
    plainLanguage: "p"
  });
  const run = (changedFiles: string[], withPlan = true) =>
    verifyAgentRun({
      request: builderRequest,
      result: resultFor(validBuilder(), []),
      changedFiles,
      plan: withPlan ? plan : undefined
    });

  it("accepts changes the plan lists and generated GraphQL outputs", () => {
    expect(
      run(["apps/api/src/a.ts", "apps/api/src/a.test.ts", "apps/web/src/graphql/generated/gql.ts"])
        .violations
    ).toEqual([]);
  });

  it("reports a change outside the plan as scope", () => {
    expect(run(["apps/api/src/a.ts", "apps/api/src/b.ts"]).violations).toEqual([
      expect.objectContaining({
        kind: "scope",
        message: expect.stringContaining("apps/api/src/b.ts")
      })
    ]);
  });

  it("reports a protected path once, as protected-path", () => {
    expect(
      run([".husky/pre-commit", ".ai/hooks/x.mjs", "../escape.ts"]).violations.map((v) => v.kind)
    ).toEqual(["protected-path", "protected-path", "protected-path"]);
  });

  it("checks protected paths without a plan, and scope only with one", () => {
    expect(run(["README.md"], false).violations).toEqual([]);
    expect(run([".claude/settings.json"], false).violations.map((v) => v.kind)).toEqual([
      "protected-path"
    ]);
  });

  it("passes engine ref violations through", () => {
    const verdict = verifyAgentRun({
      request: builderRequest,
      result: resultFor(validBuilder(), []),
      refs: { violations: ["HEAD moved from aaa to bbb", "tag v1 was created"] }
    });
    expect(verdict.violations).toEqual([
      { kind: "refs-changed", message: "HEAD moved from aaa to bbb" },
      { kind: "refs-changed", message: "tag v1 was created" }
    ]);
    expect(verdict.ok).toBe(false);
  });
});
