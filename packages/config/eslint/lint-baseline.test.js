import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { URL, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// Workspaces lint with `eslint .` from their own directory, and the ESLint CLI
// reads `eslint-suppressions.json` from that directory. These cases run the
// real CLI the same way, against the real anti-slop config, so an ESLint
// upgrade that changes the baseline contract fails here.
const require = createRequire(import.meta.url);
const ESLINT_BIN = join(dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
const RULE = "anti-slop/no-comment-provenance";

const workspaces = [];

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function lintWorkspace({ source, baselineCount }) {
  const dir = mkdtempSync(join(tmpdir(), "lint-baseline-"));
  workspaces.push(dir);
  const tseslintUrl = pathToFileURL(require.resolve("typescript-eslint")).href;
  const antiSlopUrl = new URL("./anti-slop.js", import.meta.url).href;
  writeFileSync(
    join(dir, "eslint.config.mjs"),
    `import tseslint from ${JSON.stringify(tseslintUrl)};\n` +
      `import antiSlop from ${JSON.stringify(antiSlopUrl)};\n` +
      "export default [tseslint.configs.base, ...antiSlop];\n"
  );
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), source);
  writeFileSync(
    join(dir, "eslint-suppressions.json"),
    JSON.stringify({ "src/a.ts": { [RULE]: { count: baselineCount } } })
  );
  const run = spawnSync(process.execPath, [ESLINT_BIN, "."], { cwd: dir, encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

describe("lint baseline (eslint-suppressions.json)", () => {
  it("passes when every violation of a rule in a file is in the baseline", () => {
    const result = lintWorkspace({
      source: "// Fixed in issue #12.\nexport const a = 1;\n",
      baselineCount: 1
    });

    expect(result).toEqual({ status: 0, output: "" });
  }, 20_000);

  it("fails on a violation beyond the baselined count", () => {
    const result = lintWorkspace({
      source: "// Fixed in issue #12.\nexport const a = 1;\n// See #13.\nexport const b = 2;\n",
      baselineCount: 1
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain(RULE);
  }, 20_000);

  it("fails on a stale baseline entry and names the prune command", () => {
    const result = lintWorkspace({
      source: "// Retries stop after three attempts.\nexport const a = 1;\n",
      baselineCount: 1
    });

    expect(result.status).toBe(2);
    expect(result.output).toContain("--prune-suppressions");
  }, 20_000);
});
