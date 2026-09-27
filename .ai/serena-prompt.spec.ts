import { ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cleanup: vi.fn(async () => "passed") }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: mocks.spawn
}));
vi.mock("./process-cleanup.util", () => ({ stopProcessTree: mocks.cleanup }));
import { renderClaudeSettings } from "./ai.util";
import { mergeInstalledConfig } from "./install-config.util";
import { validateHookPins } from "./mcp-probe.util";
import { inspectSerenaPrompt, prepareSerenaPrompt } from "./serena-prompt.util";

const root = mkdtempSync(path.join(tmpdir(), "kaine-serena-test-"));
const server = {
  command: "uvx",
  args: [
    "--from",
    `git+https://example.test/serena@${"a".repeat(40)}`,
    "serena",
    "start-mcp-server"
  ]
};
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
  vi.clearAllMocks();
});
function child() {
  const process = Object.assign(new ChildProcess(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough()
  });
  mocks.spawn.mockReturnValue(process);
  return process;
}
async function seed() {
  const process = child();
  const result = prepareSerenaPrompt(root, server);
  process.stdout.write("Cached instructions");
  Object.defineProperty(process, "exitCode", { value: 0 });
  process.emit("close", 0);
  await result;
}

it("prepares the selected commit and only emits a current cache", async () => {
  expect(inspectSerenaPrompt(root)).toEqual({ status: "disabled" });
  expect(inspectSerenaPrompt(root, server)).toEqual({ status: "not-prepared" });
  await seed();
  expect(inspectSerenaPrompt(root, server)).toEqual({
    status: "ready",
    prompt: "Cached instructions"
  });
  expect(mocks.spawn).toHaveBeenCalledWith(
    "uvx",
    ["--from", server.args[1], "serena", "prompts", "print-cc-system-prompt-override"],
    expect.objectContaining({ windowsHide: true })
  );
  expect(inspectSerenaPrompt(root, { ...server, args: [...server.args, "--changed"] })).toEqual({
    status: "stale"
  });
  expect(readdirSync(path.join(root, ".ai.local/serena"))).toEqual(["claude-prompt.json"]);
  expect(inspectSerenaPrompt(root, { command: "personal" })).toEqual({ status: "unsupported" });
  await expect(prepareSerenaPrompt(root, { command: "personal" })).rejects.toThrow("Unsupported");
  expect(mocks.spawn).toHaveBeenCalledTimes(1);
});

it.each(["timeout", "output", "stderr-output", "exit", "launch", "cleanup", "cleanup-success"])(
  "preserves the old cache after %s failure without exposing output",
  async (failure) => {
    await seed();
    const file = path.join(root, ".ai.local/serena/claude-prompt.json");
    const before = readFileSync(file, "utf8");
    vi.useFakeTimers();
    const process = child();
    if (failure.startsWith("cleanup")) mocks.cleanup.mockResolvedValueOnce("failed");
    const result = prepareSerenaPrompt(root, server);
    const rejected = expect(result).rejects.toThrow(
      failure.startsWith("cleanup") ? "cleanup failed" : /Serena/
    );
    if (failure === "output") process.stdout.write(Buffer.alloc(65537));
    else if (failure === "stderr-output") process.stderr.write(Buffer.alloc(65537));
    else if (failure === "launch") process.emit("error", new Error("private"));
    else if (failure !== "timeout") {
      process.stderr.write("private");
      process.emit("close", failure === "cleanup-success" ? 0 : 1);
    }
    await vi.advanceTimersByTimeAsync(60001);
    await rejected;
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(mocks.cleanup).toHaveBeenCalledWith(process);
  }
);

it("migrates only the exact legacy repository Serena hook and checks launch pins", () => {
  const legacy =
    "uvx --from git+https://github.com/oraios/serena serena prompts print-cc-system-prompt-override || echo 'warning: serena prompt unavailable, run pnpm ai:doctor'";
  const personal = { hooks: [{ type: "command", command: `${legacy} --personal` }] };
  const previous = JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: legacy }] }, personal] }
  });
  const merged = JSON.parse(mergeInstalledConfig(previous, renderClaudeSettings(), false, []));
  expect(merged.hooks.SessionStart).toHaveLength(2);
  expect(merged.hooks.SessionStart[0]).toEqual(personal);
  expect(renderClaudeSettings()).not.toMatch(/uvx|npx|git\+/);
  expect(validateHookPins([legacy, "npx package@latest"])).toHaveLength(2);
  expect(
    validateHookPins([`uvx --from ${server.args[1]} serena`, "npx -y @org/package@1.2.3"])
  ).toEqual([]);
});
