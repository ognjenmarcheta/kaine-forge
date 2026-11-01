import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

// A fake agent-desktop on PATH: `status` reports a live accessibility bus.
let bin;
before(() => {
  bin = mkdtempSync(join(tmpdir(), "smoke-desktop-"));
  const status = JSON.stringify({
    ok: true,
    command: "status",
    data: { version: "1.0.2", supported_surfaces: ["window"] }
  });
  writeFileSync(join(bin, "agent-desktop"), `#!/bin/sh\necho '${status}'\n`);
  chmodSync(join(bin, "agent-desktop"), 0o755);
  mkdirSync(join(bin, "empty"));
});
after(() => rmSync(bin, { recursive: true, force: true }));

async function smoke(path, args = []) {
  try {
    const { stdout, stderr } = await run(process.execPath, ["scripts/smoke-desktop.mjs", ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: path }
    });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

describe("smoke-desktop", { skip: process.platform === "win32" }, () => {
  it("names the install command when the CLI is missing", async () => {
    const result = await smoke(join(bin, "empty"));
    assert.equal(result.code, 1, result.output);
    assert.match(
      result.output,
      /FAIL agent-desktop CLI not installed; install: npm install -g agent-desktop@1\.0\.2/
    );
  });

  it("stops before starting the desktop shell when web is down", async () => {
    const result = await smoke(bin, ["--web", "http://127.0.0.1:9/"]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /PASS agent-desktop status/);
    assert.match(
      result.output,
      /FAIL web is not answering at http:\/\/127\.0\.0\.1:9\/; start it with pnpm dev:web/
    );
  });
});
