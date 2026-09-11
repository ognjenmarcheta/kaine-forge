import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { pnpmInvocation } from "./pnpm.util.mjs";

test("forwards shell metacharacters and spaces unchanged to a JS package manager", () => {
  const dir = mkdtempSync(join(tmpdir(), "kaine pnpm "));
  try {
    const executable = join(dir, "pnpm.cjs");
    writeFileSync(executable, "console.log(JSON.stringify(process.argv.slice(2)))");
    const args = ["space name", "a&b", "$(echo bad)", 'a"b', "%PATH%", "semi;colon"];
    const invocation = pnpmInvocation(args, executable, "win32");
    const result = spawnSync(invocation.command, invocation.args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), args);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uses standalone pnpm executables directly", () => {
  assert.deepEqual(pnpmInvocation(["--version"], "C:/pnpm.exe", "win32"), {
    command: "C:/pnpm.exe",
    args: ["--version"]
  });
});

test("Windows fallback permits only the fixed version probe", () => {
  assert.equal(pnpmInvocation(["--version"], "", "win32").args.at(-1), "pnpm --version");
  assert.throws(() => pnpmInvocation(["exec", "a&b"], "", "win32"), /pnpm package script/);
});
