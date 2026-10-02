import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";

let root: string;
const git = (args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
function evidence() {
  const source = readFileSync(
    new URL("./docker/factory-storage.mjs", import.meta.url),
    "utf8"
  ).replace('const root = "/workspace";', `const root = ${JSON.stringify(root)};`);
  return z
    .object({ files: z.array(z.string()), warnings: z.array(z.string()) })
    .parse(
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--input-type=module", "-e", source, "helper", "evidence"],
          { input: "{}", encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
        )
      )
    );
}
function sparse(name: string, size: number) {
  const file = openSync(path.join(root, name), "w");
  try {
    ftruncateSync(file, size);
  } finally {
    closeSync(file);
  }
}
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "factory-export-test-"));
  git(["init"]);
  git(["config", "user.name", "Test Owner"]);
  git(["config", "user.email", "owner@example.com"]);
  writeFileSync(path.join(root, ".gitignore"), "ignored.txt\nnode_modules/\n");
  writeFileSync(path.join(root, "tracked.txt"), "old\n");
  git(["add", "."]);
  git(["commit", "-m", "test: baseline"]);
  mkdirSync(path.join(root, "evidence"));
});
afterEach(() => {
  if (path.dirname(root) !== path.resolve(tmpdir())) throw new Error("Unsafe fixture cleanup");
  rmSync(root, { recursive: true, force: true });
});
it("recovers tracked and safe new source files without generated evidence or recursive patches", () => {
  writeFileSync(path.join(root, "tracked.txt"), "changed\n");
  writeFileSync(path.join(root, "new.ts"), "export const value = 1;\n");
  writeFileSync(path.join(root, "ignored.txt"), "ignored");
  writeFileSync(path.join(root, "evidence", "output.log"), "generated");
  mkdirSync(path.join(root, "node_modules"));
  writeFileSync(path.join(root, "node_modules", "package.js"), "generated");
  const first = evidence();
  const patch = readFileSync(path.join(root, "evidence/recovery.patch"), "utf8");
  expect(first.files[0]).toBe("evidence/recovery.patch");
  expect(patch).toContain("new.ts");
  expect(patch).toContain("changed");
  expect(patch).not.toMatch(/ignored|generated|recovery\.patch/);
  expect(evidence()).toEqual(first);
  expect(readFileSync(path.join(root, "evidence/recovery.patch"), "utf8")).toBe(patch);
  git(["reset", "--hard", "HEAD"]);
  git(["apply", "evidence/recovery.patch"]);
  expect(readFileSync(path.join(root, "new.ts"), "utf8")).toContain("value = 1");
});
it("reserves recovery space and bounds file count, depth and bytes with visible warnings", () => {
  for (let i = 0; i < 505; i++) writeFileSync(path.join(root, "evidence", `${i}.log`), "evidence");
  const deep = path.join(root, "evidence", ...Array<string>(14).fill("nested"));
  mkdirSync(deep, { recursive: true });
  writeFileSync(path.join(deep, "deep.log"), "deep");
  const result = evidence();
  expect(result.files).toHaveLength(500);
  expect(result.files[0]).toBe("evidence/recovery.patch");
  expect(result.warnings).toEqual(
    expect.arrayContaining([expect.stringContaining("count"), expect.stringContaining("depth")])
  );
  rmSync(path.join(root, "evidence"), { recursive: true });
  mkdirSync(path.join(root, "evidence"));
  for (let i = 0; i < 5; i++) sparse(`evidence/${i}.zip`, 60 * 1024 * 1024);
  sparse("evidence/oversized.zip", 65 * 1024 * 1024);
  const bounded = evidence();
  expect(bounded.files).toHaveLength(5);
  expect(bounded.files).not.toContain("evidence/oversized.zip");
  expect(bounded.warnings).toEqual([expect.stringContaining("byte")]);
});
it("rejects unsafe recovery sources and evidence symlinks", () => {
  symlinkSync(root, path.join(root, "evidence", "linked"), "junction");
  expect(evidence).toThrow();
  rmSync(path.join(root, "evidence", "linked"));
  sparse("huge.ts", 65 * 1024 * 1024);
  expect(evidence).toThrow();
});
it("imports a small prerequisite bundle without exporting the repository history", () => {
  writeFileSync(path.join(root, "large.bin"), randomBytes(8 * 1024 * 1024));
  git(["add", "large.bin"]);
  git(["commit", "-m", "test: historical data"]);
  git(["rm", "large.bin"]);
  git(["commit", "-m", "test: remove historical data"]);
  const revision = git(["rev-parse", "HEAD"]);
  writeFileSync(path.join(root, "tracked.txt"), "candidate\n");
  git(["add", "tracked.txt"]);
  git(["commit", "-m", "test: candidate"]);
  const candidate = git(["rev-parse", "HEAD"]);
  git(["bundle", "create", "evidence/candidate.bundle", `${revision}..HEAD`]);
  expect(statSync(path.join(root, "evidence/candidate.bundle")).size).toBeLessThan(4096);
  git(["reset", "--hard", revision]);
  git(["bundle", "verify", "evidence/candidate.bundle"]);
  git(["fetch", "evidence/candidate.bundle", "HEAD"]);
  expect(git(["rev-parse", "FETCH_HEAD"])).toBe(candidate);
  expect(git(["rev-parse", "FETCH_HEAD^"])).toBe(revision);
});
