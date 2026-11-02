import { describe, expect, it } from "vitest";

import { resolveCapabilities } from "../agents/capabilities.resolve";
import { MAX_REFERENCE_BYTES } from "../contracts";
import { JOB_MCP, JOB_SKILLS, jobPermissions, screenFolder } from "./jobs.permissions";
import { ReferenceError, decodeReference, diffPercentOf } from "./jobs.screen";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("decodeReference", () => {
  it("keeps a real image under its screen id, with the extension of its real type", () => {
    const decoded = decodeReference("10-sample", {
      mediaType: "image/png",
      dataBase64: PNG.toString("base64")
    });
    expect(decoded.fileName).toBe("10-sample.png");
    expect(decoded.bytes.equals(PNG)).toBe(true);
  });

  it.each([
    ["text that claims to be a PNG", "image/png" as const, Buffer.from("<svg onload=x>")],
    ["a PNG that claims to be a JPEG", "image/jpeg" as const, PNG],
    [
      "an image above the size limit",
      "image/png" as const,
      Buffer.concat([PNG, Buffer.alloc(MAX_REFERENCE_BYTES)])
    ]
  ])("refuses %s", (_name, mediaType, bytes) => {
    expect(() =>
      decodeReference("10-sample", { mediaType, dataBase64: bytes.toString("base64") })
    ).toThrow(ReferenceError);
  });
});

describe("the screen job's permissions", () => {
  const profile = resolveCapabilities({
    agent: {
      capabilities: {
        preset: "read-only",
        mcp: [...JOB_MCP.screen],
        skills: [...JOB_SKILLS.screen],
        tools: []
      }
    },
    provider: "claude",
    model: "opus",
    policy: { denies: [] },
    installed: { skills: [...JOB_SKILLS.screen], mcp: ["serena", "playwright"] },
    isolation: "host"
  });

  it("writes only its own screen folder, runs only the lab and check commands, and gets the browser", () => {
    const { allow, disallow } = jobPermissions(profile, "screen", [
      `${screenFolder("10-sample")}/**`
    ]);
    expect(allow.filter((rule) => rule.startsWith("Edit") || rule.startsWith("Write"))).toEqual([
      "Edit(tooling/desk-ui/src/lab/screens/10-sample/**)"
    ]);
    expect(allow.filter((rule) => rule.startsWith("Bash(pnpm"))).toEqual([
      "Bash(pnpm lab:diff:*)",
      "Bash(pnpm lab:shots:*)",
      "Bash(pnpm --filter @repo/desk-ui test:*)",
      "Bash(pnpm --filter @repo/desk-ui lint:*)",
      "Bash(pnpm --filter @repo/desk-ui typecheck:*)",
      "Bash(pnpm ui:check:*)"
    ]);
    expect(allow).toEqual(expect.arrayContaining(["mcp__playwright", "Agent"]));
    expect(disallow).toEqual(expect.arrayContaining(["Bash(gh:*)", "Bash(pnpm dev:*)"]));
  });

  it.each(["../escape", "10-sample/../x", "sample"])("refuses the screen id %s", (id) => {
    expect(() => screenFolder(id)).toThrow(RangeError);
  });
});

describe("diffPercentOf", () => {
  it("reads the screen's share from lab:diff --json after the pnpm banner", () => {
    const stdout = `> tsx scripts/lab-diff.ts\n[\n  { "id": "10-sample", "differing": 3.4, "crop": false }\n]\n`;
    expect(diffPercentOf(stdout, "10-sample")).toBe(3.4);
    expect(diffPercentOf(stdout, "11-other")).toBeNull();
    expect(diffPercentOf("no json", "10-sample")).toBeNull();
  });
});
