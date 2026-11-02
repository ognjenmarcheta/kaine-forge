import { describe, expect, it } from "vitest";

import { JOB_MCP, JOB_SKILLS, jobPermissions } from "./jobs.permissions";
import { resolveCapabilities } from "../agents/capabilities.resolve";

const profile = resolveCapabilities({
  agent: {
    capabilities: {
      preset: "read-only",
      mcp: [...JOB_MCP.scorecard],
      skills: [...JOB_SKILLS.scorecard],
      tools: []
    }
  },
  provider: "claude",
  model: "opus",
  policy: { denies: [] },
  installed: { skills: [...JOB_SKILLS.scorecard, "kaine-open-pr"], mcp: ["serena"] },
  isolation: "host"
});

describe("jobPermissions", () => {
  it("lets the scorecard job read and start subagents, and nothing that writes or runs", () => {
    const { allow, disallow } = jobPermissions(profile, "scorecard");

    expect(allow).toEqual(expect.arrayContaining(["Read", "Glob", "Grep", "Agent", "Task"]));
    expect(allow).toContain("Skill(skill:kaine-scorecard)");
    expect(
      allow.filter((rule) => /^(Edit|Write)$/.test(rule) || rule.startsWith("Bash(pnpm"))
    ).toEqual([]);
    // The policy floor stays: no gh, no installs, no skill outside the job's list.
    expect(disallow).toEqual(
      expect.arrayContaining([
        "Bash(gh:*)",
        "Bash(pnpm install:*)",
        "WebFetch",
        "Skill(skill:kaine-open-pr)"
      ])
    );
  });
});
