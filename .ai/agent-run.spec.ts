import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

import {
  assertSupportedSandbox,
  commandEnvironment,
  controllerEnvironment,
  parseAgentRunOptions,
  probeResultSchema,
  projectConfigRestrictions,
  sandboxConfig
} from "./agent-run.util";

describe("native sandbox contract", () => {
  it("defaults to read mode, requires a model, and rejects policy overrides", () => {
    expect(parseAgentRunOptions(["--model", "test", "--prompt-file", "prompt.md"])).toMatchObject({
      mode: "read",
      timeout: 1800
    });
    for (const args of [
      [],
      ["--mode", "unrestricted"],
      ["--sandbox", "danger-full-access"],
      ["--probe-only", "--timeout", "0"],
      ["--probe-only", "-c", "x=y"]
    ])
      expect(() => parseAgentRunOptions(args)).toThrow();
    expect(() => assertSupportedSandbox("linux", "codex-cli 0.153.4")).toThrow("Windows");
    expect(() => assertSupportedSandbox("win32", "codex-cli 0.153.3")).toThrow();
    expect(() => assertSupportedSandbox("win32", "codex-cli 0.153.4")).not.toThrow();
  });
  it("keeps controller authentication separate from command environments and drops inherited overrides", () => {
    const env = {
      PATH: "runtime",
      OPENAI_API_KEY: "synthetic",
      DATABASE_URL: "secret",
      CODEX_PERMISSION_PROFILE: "disabled",
      NODE_OPTIONS: "inject",
      CODEX_HOME: "auth"
    };
    expect(commandEnvironment(env)).toEqual({ PATH: "runtime" });
    expect(controllerEnvironment(env, true)).toEqual({
      PATH: "runtime",
      OPENAI_API_KEY: "synthetic",
      CODEX_HOME: "auth"
    });
    expect(controllerEnvironment(env, false)).toEqual({ PATH: "runtime", CODEX_HOME: "auth" });
  });
  it("serializes path rules as one valid TOML value without legacy settings", () => {
    const args = sandboxConfig({
      profileName: "test",
      temporary: "C:/temp",
      outside: "C:/outside",
      nodeDirectory: "C:/node",
      mode: "edit",
      commandEnv: { PATH: "C:/node" }
    });
    const settings = args.filter((arg) => arg !== "-c");
    const parsed = parse(settings.join("\n"));
    expect(parsed).toMatchObject({
      default_permissions: "test",
      windows: { sandbox: "elevated" },
      mcp_servers: {},
      permissions: {
        test: {
          filesystem: {
            ":minimal": "read",
            ":workspace_roots": {
              ".": "write",
              ".env": "deny",
              ".git": "deny",
              ".ai.local": "deny"
            }
          },
          network: { enabled: false }
        }
      }
    });
    expect(settings.join("\n")).not.toMatch(/sandbox_mode|sandbox_workspace_write/);
  });
  it("fails closed when either a positive or negative control fails", () => {
    const proof = {
      outsideReadDenied: true,
      environmentFileDenied: true,
      gitDenied: true,
      environmentIsolated: true,
      allowedRead: true,
      expectedWrite: true,
      protectedDenied: true,
      outsideWriteDenied: true,
      networkDenied: true
    };
    expect(probeResultSchema.safeParse(proof).success).toBe(true);
    for (const key of Object.keys(proof))
      expect(probeResultSchema.safeParse({ ...proof, [key]: false }).success).toBe(false);
  });
  it("rejects conflicting project settings before dispatch", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kaine-policy-test-"));
    try {
      mkdirSync(path.join(root, ".codex"));
      writeFileSync(path.join(root, ".codex/config.toml"), 'sandbox_mode="danger-full-access"');
      expect(() => projectConfigRestrictions(root)).toThrow();
      writeFileSync(path.join(root, ".codex/config.toml"), "[hooks]\n");
      expect(() => projectConfigRestrictions(root)).toThrow("Unrecognized");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
