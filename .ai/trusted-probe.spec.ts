import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  model: vi.fn(),
  dispatch: vi.fn(() => {
    throw new Error("Model dispatch prohibited in this test");
  })
}));
vi.mock("./native-sandbox", () => ({ runNativeProbe: mocks.probe }));
vi.mock("./model-process.util", () => ({ runModelProcess: mocks.model }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: mocks.dispatch,
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) =>
      args[0] === "codex"
        ? "codex-cli 0.154.0"
        : args[0] === "git"
          ? "fixture-revision"
          : actual.execFileSync(...args)
  };
});
vi.mock("./agent-run.util", async (original) => ({
  ...(await original<typeof import("./agent-run.util")>()),
  assertSupportedSandbox: () => {}
}));
import { runCodingAgent } from "./agent-run";
import { renderCodexConfig } from "./ai.util";

const reports = path.join(process.cwd(), ".ai.local/agent-runs");
mkdirSync(reports, { recursive: true });
const before = new Set(readdirSync(reports));
afterEach(() => {
  for (const file of readdirSync(reports)) if (!before.has(file)) rmSync(path.join(reports, file));
  vi.clearAllMocks();
});
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-trusted-probe-"));
  mkdirSync(path.join(root, ".ai/hooks"), { recursive: true });
  mkdirSync(path.join(root, ".codex"));
  mkdirSync(path.join(root, ".git"));
  writeFileSync(path.join(root, ".git/HEAD"), "synthetic");
  writeFileSync(path.join(root, ".codex/config.toml"), renderCodexConfig({ mcpServers: {} }));
  for (const file of [
    "permissions.json",
    "hooks/pre-tool-use.mjs",
    "hooks/guarded-command.mjs",
    "hooks/session-start.mjs",
    "sandbox-probe.mjs"
  ])
    copyFileSync(path.join(process.cwd(), ".ai", file), path.join(root, ".ai", file));
  return root;
}

it("rejects altered workspace dependencies before any native or model command", async () => {
  const root = workspace();
  try {
    writeFileSync(path.join(root, ".ai/sandbox-probe.mjs"), "console.log('forged')");
    await expect(runCodingAgent(["--workspace", root, "--probe-only"])).rejects.toThrow(
      "Untrusted runner dependency"
    );
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("executes captured controller bytes after workspace replacement and denies dispatch on failed evidence", async () => {
  const root = workspace();
  try {
    mocks.probe.mockImplementation(async (input: { command: string[] }) => {
      writeFileSync(path.join(root, ".ai/sandbox-probe.mjs"), "console.log('forged')");
      expect(input.command.slice(0, 3)).toEqual([
        process.execPath,
        "--input-type=module",
        "--eval"
      ]);
      expect(input.command[3]).toBe(
        readFileSync(path.join(process.cwd(), ".ai/sandbox-probe.mjs"), "utf8")
      );
      const command = input.command[0];
      if (!command) throw new Error("Missing executable");
      // Execute the exact argv without isolation: the positive read/write/network controls work,
      // but protected reads are allowed. This must fail certification and prohibit model dispatch.
      return execFileSync(command, input.command.slice(1), { encoding: "utf8" });
    });
    await expect(
      runCodingAgent([
        "--workspace",
        root,
        "--model",
        "synthetic-never-called",
        "--prompt-file",
        "unused",
        "--mode",
        "edit"
      ])
    ).rejects.toThrow("enforcement failed");
    expect(mocks.probe).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function passingSyntheticProbe() {
  mocks.probe.mockResolvedValue(
    JSON.stringify({
      outsideReadDenied: true,
      environmentFileDenied: true,
      gitDenied: true,
      environmentIsolated: true,
      allowedRead: true,
      expectedWrite: true,
      protectedDenied: true,
      outsideWriteDenied: true,
      networkDenied: true,
      networkEvidence: "denied"
    })
  );
}

it("records probe-only completion without starting a model", async () => {
  const root = workspace();
  try {
    passingSyntheticProbe();
    const result = await runCodingAgent(["--workspace", root, "--probe-only"]);
    expect(result.run).toMatchObject({ termination: "completed", cleanup: "not-started" });
    expect(mocks.model).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  { cleanup: "failed", failure: "process cleanup failed" },
  { cleanup: "passed", failure: "Model output did not close before finalization deadline" }
])(
  "persists $failure and exits nonzero despite a completed model event",
  async ({ cleanup, failure }) => {
    const root = workspace();
    const argv = process.argv;
    const exitCode = process.exitCode;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      passingSyntheticProbe();
      const prompt = path.join(root, "prompt.md");
      writeFileSync(prompt, "synthetic; no model calls");
      mocks.model.mockImplementation(async (input: { stdout: (chunk: Buffer) => void }) => {
        input.stdout(Buffer.from('{"type":"turn.completed"}\n'));
        return {
          termination: "failed",
          exitCode: 0,
          cleanup,
          failure
        };
      });
      process.argv = [
        process.execPath,
        path.join(process.cwd(), ".ai/agent-run.ts"),
        "--workspace",
        root,
        "--model",
        "synthetic",
        "--prompt-file",
        prompt
      ];
      vi.resetModules();
      await import("./agent-run");
      await vi.waitFor(() => expect(log).toHaveBeenCalled());
      expect(process.exitCode).toBe(1);
      expect(mocks.probe).toHaveBeenCalledTimes(2);
      expect(mocks.model).toHaveBeenCalledTimes(1);
      const report = readdirSync(reports).find((file) => !before.has(file));
      if (!report) throw new Error("Missing synthetic report");
      expect(JSON.parse(readFileSync(path.join(reports, report), "utf8"))).toMatchObject({
        termination: "failed",
        cleanup,
        failure
      });
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  }
);
