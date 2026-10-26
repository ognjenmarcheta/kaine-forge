import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { affectedJobs } from "./ci-affected.mjs";

const pkg = (path) => ({ name: `@repo/${path.split("/")[1]}`, path });
const api = { app: "api", dockerfile: "Dockerfile.api" };
const web = { app: "web", dockerfile: "Dockerfile.web" };

describe("CI affected jobs", () => {
  const cases = [
    {
      name: "a desk-only change runs no app job",
      packages: ["tooling/desk", "tooling/desk-ui", "tooling/doc-export"],
      expected: { unit: false, webApi: false, mobile: false, dockerMatrix: [] }
    },
    {
      name: "a web UI change builds only the web image",
      packages: ["packages/ui", "apps/web", "apps/desktop", "tooling/desk-ui"],
      expected: { unit: true, webApi: true, mobile: false, dockerMatrix: [web] }
    },
    {
      name: "a shared auth change reaches every app",
      packages: ["packages/auth", "apps/api", "apps/web", "apps/mobile", "apps/desktop"],
      expected: { unit: true, webApi: true, mobile: true, dockerMatrix: [api, web] }
    },
    {
      name: "an e2e-only change runs e2e without coverage or images",
      packages: ["apps/e2e"],
      expected: { unit: false, webApi: true, mobile: false, dockerMatrix: [] }
    },
    {
      name: "a mobile UI change runs the mobile jobs only",
      packages: ["packages/mobile-ui", "apps/mobile"],
      expected: { unit: true, webApi: false, mobile: true, dockerMatrix: [] }
    }
  ];
  for (const { name, packages, expected } of cases) {
    it(name, () => {
      assert.deepEqual(
        affectedJobs({ packages: packages.map(pkg), force: false, docker: true }),
        expected
      );
    });
  }

  it("runs every job when forced, and images only when Docker inputs changed", () => {
    assert.deepEqual(affectedJobs({ packages: [], force: true, docker: true }), {
      unit: true,
      webApi: true,
      mobile: true,
      dockerMatrix: [api, web]
    });
    assert.deepEqual(affectedJobs({ packages: [], force: true, docker: false }).dockerMatrix, []);
    assert.deepEqual(
      affectedJobs({ packages: [pkg("apps/api")], force: false, docker: false }).dockerMatrix,
      []
    );
  });
});

describe("CI affected CLI", () => {
  function run(input, env) {
    const dir = mkdtempSync(join(tmpdir(), "ci-affected-"));
    const output = join(dir, "output");
    const file = join(dir, "affected.json");
    writeFileSync(output, "");
    writeFileSync(file, input);
    const result = spawnSync(process.execPath, ["scripts/ci-affected.mjs", file], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, FORCE: "false", DOCKER: "true", ...env }
    });
    const written = readFileSync(output, "utf8");
    rmSync(dir, { recursive: true, force: true });
    return { ...result, written };
  }

  it("writes step outputs from turbo ls JSON", () => {
    const input = JSON.stringify({ packages: { items: [pkg("apps/api")] } });
    const result = run(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.written,
      'unit=true\nweb_api=true\nmobile=false\ndocker_matrix=[{"app":"api","dockerfile":"Dockerfile.api"}]\n'
    );
  });

  it("fails, so the gate fails, when turbo output is missing or malformed", () => {
    for (const input of ["", "{}", '{"packages":{"items":null}}']) {
      const result = run(input);
      assert.equal(result.status, 1);
      assert.equal(result.written, "");
      assert.match(result.stderr, /Invalid affected package input/);
    }
  });
});
