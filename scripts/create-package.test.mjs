/* global process */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "scripts", "create-package.mjs");
// The files the scaffold edits, copied from the real repo so anchor drift fails here.
const wiringTargets = [
  "tsconfig.base.json",
  "apps/web/vite.config.ts",
  "vitest.coverage.config.ts"
];

describe("create-package", () => {
  const root = mkdtempSync(join(tmpdir(), "create-package-"));
  const name = "probe-kit";
  const dir = join(root, "packages", name);

  before(() => {
    for (const target of wiringTargets) {
      mkdirSync(dirname(join(root, target)), { recursive: true });
      cpSync(join(repoRoot, target), join(root, target));
    }
    execFileSync(process.execPath, [script, name, "--description", "Probe"], {
      env: { ...process.env, CREATE_PACKAGE_ROOT: root },
      stdio: "pipe"
    });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes vitest.config.ts that spreads the shared vitest exclude", () => {
    const config = readFileSync(join(dir, "vitest.config.ts"), "utf8");
    assert.match(config, /from "@repo\/config\/vitest"/);
    assert.match(config, /exclude: vitestExclude/);
  });

  it("writes a composite tsconfig.build.json that excludes tests", () => {
    const build = JSON.parse(readFileSync(join(dir, "tsconfig.build.json"), "utf8"));
    assert.equal(build.extends, "./tsconfig.json");
    assert.deepEqual(build.compilerOptions, {
      composite: true,
      rootDir: "src",
      outDir: "dist",
      paths: {},
      tsBuildInfoFile: "${configDir}/dist/.tsbuildinfo"
    });
    assert.ok(build.exclude.some((pattern) => pattern.includes("*.test.ts")));
  });

  it("builds through tsconfig.build.json with tsc -b", () => {
    const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    assert.equal(packageJson.name, "@repo/probe-kit");
    assert.equal(packageJson.scripts.build, "tsc -b tsconfig.build.json");
    assert.match(packageJson.scripts.test, /\bvitest\b/);
  });

  it("writes .prettierignore for build output", () => {
    assert.equal(
      readFileSync(join(dir, ".prettierignore"), "utf8"),
      "dist\n.turbo\nnode_modules\n"
    );
  });

  it("wires tsconfig paths, the web Vite alias, and the coverage project", () => {
    const tsconfigBase = readFileSync(join(root, "tsconfig.base.json"), "utf8");
    assert.match(tsconfigBase, /"@repo\/probe-kit": \["packages\/probe-kit\/src\/index\.ts"\]/);
    assert.match(tsconfigBase, /"@repo\/probe-kit\/\*": \["packages\/probe-kit\/src\/\*"\]/);

    const viteConfig = readFileSync(join(root, "apps/web/vite.config.ts"), "utf8");
    assert.match(
      viteConfig,
      /"@repo\/probe-kit": path\.join\(workspaceRoot, "packages\/probe-kit\/src\/index\.ts"\)/
    );

    const coverageConfig = readFileSync(join(root, "vitest.coverage.config.ts"), "utf8");
    assert.match(coverageConfig, /"packages\/probe-kit",/);
  });
});
