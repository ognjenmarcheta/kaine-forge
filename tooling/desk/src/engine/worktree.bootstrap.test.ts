import { describe, expect, it } from "vitest";

import { CONVENTIONAL_TYPES } from "../contracts";
import {
  bootstrapPlan,
  branchName,
  evaluateStep,
  slugify,
  type BootstrapInput
} from "./worktree.bootstrap";
import { isValidBranchName } from "../git";

/** The pattern AGENTS.md states, plus `revert`, which CONTRIBUTING.md also allows. */
const AGENTS_PATTERN =
  /^KAINE-(\d+-)?(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)-[a-z0-9-]+$/;

const input = (over: Partial<BootstrapInput> = {}): BootstrapInput => ({
  issue: 123,
  type: "feat",
  slug: "export-reports",
  base: "main",
  worktreeDir: "/work/kaine-forge.worktrees/KAINE-123",
  agents: ["claude"],
  skills: ["kaine-write-plan", "kaine-test"],
  mcp: ["serena"],
  ...over
});

describe("branchName", () => {
  it("builds KAINE-<issue>-<type>-<slug>", () => {
    expect(branchName({ issue: 123, type: "fix", slug: "metro-image-size" })).toBe(
      "KAINE-123-fix-metro-image-size"
    );
  });

  it("produces a name that matches the AGENTS.md pattern for every Conventional Commit type", () => {
    for (const type of CONVENTIONAL_TYPES) {
      const name = branchName({ issue: 9, type, slug: "a-b" });
      expect(name).toMatch(AGENTS_PATTERN);
      expect(isValidBranchName(name)).toBe(true);
    }
  });

  it.each([
    "Upper",
    "has space",
    "slash/inside",
    "-lead",
    "trail-",
    "double--hyphen",
    "",
    "under_score",
    "ünï"
  ])("rejects the slug %j", (slug) => {
    expect(() => branchName({ issue: 1, type: "feat", slug })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects the issue number %s", (issue) => {
    expect(() => branchName({ issue, type: "feat", slug: "x" })).toThrow(RangeError);
  });
});

describe("slugify", () => {
  it("makes a lower-case hyphen slug that branchName accepts", () => {
    const slug = slugify("Fix: Metro image size (iOS) — now!");
    expect(slug).toBe("fix-metro-image-size-ios-now");
    expect(() => branchName({ issue: 1, type: "fix", slug })).not.toThrow();
  });

  it("trims to a bounded length without a trailing hyphen", () => {
    const slug = slugify("a ".repeat(100));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to a word when nothing is left", () => {
    expect(slugify("!!! ???")).toBe("work");
    expect(slugify("日本語")).toBe("work");
  });
});

describe("bootstrapPlan", () => {
  it("returns the recipe steps in order", () => {
    const plan = bootstrapPlan(input({ agents: ["claude", "codex"] }));
    expect(plan.branch).toBe("KAINE-123-feat-export-reports");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "install",
      "env-ensure",
      "ai-install",
      "ai-doctor-claude",
      "ai-doctor-codex"
    ]);
  });

  it("installs from the lockfile, then runs the engine-owned setup in the worktree", () => {
    const steps = bootstrapPlan(input()).steps;
    const byId = Object.fromEntries(steps.map((step) => [step.id, step]));
    expect(byId.install?.argv).toEqual([
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--prefer-offline"
    ]);
    expect(byId["env-ensure"]?.argv).toEqual(["pnpm", "env:ensure"]);
    expect(byId["ai-install"]?.argv).toEqual([
      "pnpm",
      "ai:install",
      "--agent",
      "claude",
      "--non-interactive",
      "--skill",
      "kaine-write-plan,kaine-test",
      "--mcp",
      "serena",
      "--serena-interface",
      "tools"
    ]);
  });

  it("repeats --agent for each agent and checks readiness per agent", () => {
    const steps = bootstrapPlan(input({ agents: ["claude", "codex"] })).steps;
    const install = steps.find((step) => step.id === "ai-install");
    expect(install?.argv.filter((word) => word === "--agent")).toHaveLength(2);
    const doctors = steps.filter((step) => step.id.startsWith("ai-doctor-"));
    expect(doctors.map((step) => step.argv)).toEqual([
      ["pnpm", "ai:doctor", "--agent", "claude", "--local", "--json"],
      ["pnpm", "ai:doctor", "--agent", "codex", "--local", "--json"]
    ]);
    expect(doctors.every((step) => step.expect.kind === "installation-ready")).toBe(true);
  });

  it("never emits --no-verify, gh, a shell, or an argv word with shell syntax", () => {
    const plan = bootstrapPlan(input({ agents: ["claude", "codex"], mcp: ["serena"] }));
    for (const step of plan.steps) {
      expect(step.argv[0]).toBe("pnpm");
      expect(step.argv.join(" ")).not.toContain("--no-verify");
      for (const word of step.argv) {
        expect(word).not.toBe("gh");
        expect(word).not.toMatch(/^(sh|bash|zsh|cmd|-c)$/);
        expect(word).not.toMatch(/[;&|`$<>\n]/);
        expect(word).not.toMatch(/&&|\$\(/);
      }
    }
  });

  it("omits --skill and --mcp when none are given", () => {
    const install = bootstrapPlan(input({ skills: [], mcp: [] })).steps.find(
      (step) => step.id === "ai-install"
    );
    expect(install?.argv).not.toContain("--skill");
    expect(install?.argv).not.toContain("--mcp");
    expect(install?.argv).not.toContain("--serena-interface");
  });

  it.each([
    ["a relative worktree path", { worktreeDir: "relative/dir" }],
    ["a base with traversal", { base: "main/../evil" }],
    ["a base that looks like a flag", { base: "--upload-pack=x" }],
    ["a skill that injects a flag", { skills: ["kaine-test", "--agent"] }],
    ["an unknown skill name shape", { skills: ["../x"] }],
    ["an MCP name with a comma", { mcp: ["serena,evil"] }],
    ["no agents", { agents: [] }],
    ["an unknown agent", { agents: ["cursor"] as never }]
  ] as const)("rejects %s", (_name, over) => {
    expect(() => bootstrapPlan(input(over as Partial<BootstrapInput>))).toThrow();
  });
});

describe("evaluateStep", () => {
  const step = (expect: Parameters<typeof evaluateStep>[0]["expect"], id = "s") => ({ id, expect });

  it("fails any non-zero exit, including a timeout", () => {
    expect(evaluateStep(step({ kind: "exit-zero" }), { code: 1, stdout: "" })).toMatchObject({
      ok: false
    });
    expect(evaluateStep(step({ kind: "exit-zero" }), { code: null, stdout: "" })).toMatchObject({
      ok: false
    });
    expect(evaluateStep(step({ kind: "exit-zero" }), { code: 0, stdout: "" })).toEqual({
      ok: true
    });
  });

  it("requires installation=ready in the doctor JSON", () => {
    const ready = JSON.stringify({ installation: "ready", problems: [] });
    const bad = JSON.stringify({ installation: "needs-attention", problems: ["x"] });
    expect(evaluateStep(step({ kind: "installation-ready" }), { code: 0, stdout: ready }).ok).toBe(
      true
    );
    expect(
      evaluateStep(step({ kind: "installation-ready" }), { code: 0, stdout: bad })
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("needs-attention")
    });
    expect(
      evaluateStep(step({ kind: "installation-ready" }), { code: 0, stdout: "not json" }).ok
    ).toBe(false);
    expect(evaluateStep(step({ kind: "installation-ready" }), { code: 0, stdout: "{}" }).ok).toBe(
      false
    );
  });

  it("reads the doctor JSON after the banner pnpm prints on stdout", () => {
    const banner = "\n> kaine-forge@ ai:doctor /work/wt\n> tsx .ai/doctor.ts --local --json\n\n";
    const ready = JSON.stringify({ installation: "ready", problems: [] }, null, 2);
    expect(
      evaluateStep(step({ kind: "installation-ready" }), { code: 0, stdout: `${banner}${ready}\n` })
        .ok
    ).toBe(true);
    expect(
      evaluateStep(step({ kind: "installation-ready" }), {
        code: 0,
        stdout: `${banner}${JSON.stringify({ installation: "missing" })}`
      })
    ).toMatchObject({ ok: false, reason: expect.stringContaining("missing") });
  });
});
