import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_UI_DIR, UI_BUILD_ARGV, ensureUiBuilt, hasBuiltUi } from "./server.ui";
import { fail, fakeExec, ok } from "../testing/exec.fake";

let root = "";
let uiDir = "";
let printed = "";
const print = (text: string): void => {
  printed += text;
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-ui-build-"));
  uiDir = path.join(root, DEFAULT_UI_DIR);
  printed = "";
});
afterEach(() => rm(root, { recursive: true, force: true }));

const writeBuild = async (): Promise<void> => {
  await mkdir(uiDir, { recursive: true });
  await writeFile(path.join(uiDir, "index.html"), "<!doctype html>");
};

describe("ensureUiBuilt", () => {
  it("uses an existing build and runs nothing", async () => {
    await writeBuild();
    const fake = fakeExec([]);
    expect(await ensureUiBuilt({ exec: fake.exec, repoRoot: root, print })).toBe(uiDir);
    expect(fake.calls).toEqual([]);
    expect(printed).toBe("");
  });

  it("builds a missing UI with an argv and says so", async () => {
    const fake = fakeExec([{ argv: [...UI_BUILD_ARGV], reply: ok("built") }]);
    // The fake build writes the page the way vite does.
    const exec: typeof fake.exec = async (request) => {
      const result = await fake.exec(request);
      await writeBuild();
      return result;
    };
    expect(await ensureUiBuilt({ exec, repoRoot: root, print })).toBe(uiDir);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({ argv: [...UI_BUILD_ARGV], cwd: root });
    expect(printed).toContain(
      "The desk UI is not built. Building it: pnpm --filter @repo/desk-ui build"
    );
    expect(printed).toContain("Built the desk UI.");
  });

  it("treats an empty dist folder as not built", async () => {
    await mkdir(uiDir, { recursive: true });
    expect(await hasBuiltUi(uiDir)).toBe(false);
  });

  it("serves the API without the UI when the build fails, and shows the tail", async () => {
    const fake = fakeExec([
      { argv: [...UI_BUILD_ARGV], reply: fail("vite: cannot resolve entry", 1) }
    ]);
    expect(await ensureUiBuilt({ exec: fake.exec, repoRoot: root, print })).toBeNull();
    expect(printed).toContain("The UI build failed (it exited with code 1)");
    expect(printed).toContain("vite: cannot resolve entry");
  });

  it("reports a build that exits 0 without a page as a failure", async () => {
    const fake = fakeExec([{ argv: [...UI_BUILD_ARGV], reply: ok("") }]);
    expect(await ensureUiBuilt({ exec: fake.exec, repoRoot: root, print })).toBeNull();
    expect(printed).toContain("The UI build failed");
  });

  it("reports a timeout", async () => {
    const fake = fakeExec([{ argv: [...UI_BUILD_ARGV], reply: { code: null, timedOut: true } }]);
    expect(await ensureUiBuilt({ exec: fake.exec, repoRoot: root, print })).toBeNull();
    expect(printed).toContain("it timed out");
  });
});
