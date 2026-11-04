import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkPortsFor,
  fileAgeDays,
  labelerLabelNames,
  missingEnvKeys,
  missingTrackerLabels,
  nodeSatisfiesEngine,
  pnpmMatchesPackageManager,
  REQUIRED_ENV_KEYS,
  gpuiSystemPackagesResult,
  rustToolchainResult
} from "./doctor.mjs";

describe("nodeSatisfiesEngine", () => {
  it("accepts current major when range is >=22", () => {
    assert.equal(nodeSatisfiesEngine(">=22", "v22.14.0").ok, true);
    assert.equal(nodeSatisfiesEngine(">=22", "23.0.0").ok, true);
  });

  it("rejects older majors", () => {
    const result = nodeSatisfiesEngine(">=22", "v20.11.0");
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /need >=22/);
  });
});

describe("pnpmMatchesPackageManager", () => {
  it("requires exact packageManager version", () => {
    assert.equal(pnpmMatchesPackageManager("pnpm@10.29.3", "10.29.3").ok, true);
    assert.equal(pnpmMatchesPackageManager("pnpm@10.29.3", "10.28.0").ok, false);
  });
});

describe("missingEnvKeys", () => {
  it("reports absent or empty required keys", () => {
    const sample = `
DATABASE_URL=postgresql://localhost/db
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:4000
API_PORT=4000
# API_URL missing
`;
    const missing = missingEnvKeys(sample, REQUIRED_ENV_KEYS);
    assert.deepEqual(missing.sort(), ["API_URL", "BETTER_AUTH_SECRET"].sort());
  });

  it("passes when all required keys are non-empty", () => {
    const sample = REQUIRED_ENV_KEYS.map((k) => `${k}=value`).join("\n");
    assert.deepEqual(missingEnvKeys(sample), []);
  });
});

describe("checkPortsFor", () => {
  it("checks the web and API ports a worktree's .env sets, and the defaults without one", () => {
    const ports = (env) => checkPortsFor(env).map(({ port }) => port);
    assert.deepEqual(ports("WEB_PORT=13001\nAPI_PORT=14002\n"), [5432, 9000, 9001, 13001, 14002]);
    assert.deepEqual(ports(""), [5432, 9000, 9001, 3000, 4000]);
  });
});

describe("labelerLabelNames", () => {
  it("parses only top-level quoted keys, ignoring nested mappings", () => {
    const yaml = [
      '"area:web":',
      "  - changed-files:",
      "      - any-glob-to-any-file:",
      '          - "apps/web/**"',
      '"dependencies":',
      "  - changed-files:",
      ""
    ].join("\n");
    assert.deepEqual(labelerLabelNames(yaml), ["area:web", "dependencies"]);
  });

  it("returns empty when there are no top-level labels", () => {
    assert.deepEqual(labelerLabelNames('foo:\n  - "bar"\n'), []);
  });
});

describe("missingTrackerLabels", () => {
  it("reports labeler labels absent from the tracker", () => {
    assert.deepEqual(missingTrackerLabels(["area:web", "area:desktop"], ["area:web"]), [
      "area:desktop"
    ]);
  });

  it("returns empty when the tracker covers every labeler label", () => {
    assert.deepEqual(missingTrackerLabels(["a"], ["a", "b"]), []);
  });
});

describe("fileAgeDays", () => {
  it("computes whole days elapsed", () => {
    const now = Date.UTC(2026, 7, 21);
    assert.equal(fileAgeDays(now - 3 * 86_400_000, now), 3);
  });

  it("floors partial days", () => {
    const now = Date.UTC(2026, 7, 21);
    const before = now - (13 * 86_400_000 + 3_600_000);
    assert.equal(fileAgeDays(before, now), 13);
  });
});

describe("rustToolchainResult", () => {
  it("passes when rustc and cargo are both on PATH", () => {
    const result = rustToolchainResult({ rustc: "rustc 1.99.1", cargo: "cargo 1.99.1" });
    assert.equal(result.ok, true);
    assert.equal(result.warn, undefined);
    assert.match(result.detail, /rustc 1\.99\.1, cargo 1\.99\.1/);
  });

  it("fails when the toolchain is missing, because pnpm check runs cargo", () => {
    const result = rustToolchainResult({ rustc: null, cargo: null });
    assert.equal(result.ok, false);
    assert.match(result.detail, /rustc and cargo not found on PATH/);
    assert.match(result.remediation ?? "", /rustup/);
    assert.match(result.remediation ?? "", /pnpm check/);
  });

  it("names the one missing binary", () => {
    const result = rustToolchainResult({ rustc: "rustc 1.99.1", cargo: null });
    assert.equal(result.ok, false);
    assert.equal(result.detail, "cargo not found on PATH");
  });
});

describe("gpuiSystemPackagesResult", () => {
  it("is not needed off Linux", () => {
    const result = gpuiSystemPackagesResult(() => false, "darwin");
    assert.equal(result.ok, true);
    assert.equal(result.warn, undefined);
  });

  it("passes when every pkg-config module resolves", () => {
    const result = gpuiSystemPackagesResult(() => true, "linux");
    assert.equal(result.ok, true);
    assert.equal(result.warn, undefined);
  });

  it("warns with the apt line naming the missing modules", () => {
    const result = gpuiSystemPackagesResult((module) => module !== "vulkan", "linux");
    assert.equal(result.ok, true);
    assert.equal(result.warn, true);
    assert.match(result.detail, /cannot find vulkan/);
    assert.match(result.detail, /apt-get install -y .*libvulkan1 mesa-vulkan-drivers/);
    assert.doesNotMatch(result.detail, /cannot find fontconfig/);
  });
});
