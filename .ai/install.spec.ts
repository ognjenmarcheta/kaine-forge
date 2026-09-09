import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const runInstall = (args: readonly string[]) =>
  spawnSync("pnpm", ["exec", "tsx", ".ai/install.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });

describe("install CLI argument parsing", () => {
  it("accepts the pnpm run separator before its flags (issue #367)", () => {
    // `pnpm run ai:install -- --non-interactive` in the bootstrap script forwards
    // the `--` itself; the installer must skip it instead of rejecting it.
    const result = runInstall(["--", "--help"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  }, 30_000);

  it("still rejects unknown arguments", () => {
    const result = runInstall(["--bogus"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown argument: --bogus");
  }, 30_000);
});
