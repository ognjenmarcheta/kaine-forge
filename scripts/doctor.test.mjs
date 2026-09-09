import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageSummaryAgeDays,
  labelerLabelNames,
  missingEnvKeys,
  missingTrackerLabels,
  nodeSatisfiesEngine,
  pnpmMatchesPackageManager,
  REQUIRED_ENV_KEYS,
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

describe("coverageSummaryAgeDays", () => {
  it("computes whole days elapsed", () => {
    const now = Date.UTC(2026, 7, 21);
    assert.equal(coverageSummaryAgeDays(now - 3 * 86_400_000, now), 3);
  });

  it("floors partial days", () => {
    const now = Date.UTC(2026, 7, 21);
    const before = now - (13 * 86_400_000 + 3_600_000);
    assert.equal(coverageSummaryAgeDays(before, now), 13);
  });
});

describe("rustToolchainResult", () => {
  it("passes when rustc and cargo are both on PATH", () => {
    const result = rustToolchainResult({ rustc: "rustc 1.88.0", cargo: "cargo 1.88.0" }, false);
    assert.equal(result.ok, true);
    assert.equal(result.warn, undefined);
    assert.match(result.detail, /rustc 1\.88\.0, cargo 1\.88\.0/);
  });

  it("warns without failing when the toolchain is missing and desktop is not requested", () => {
    const result = rustToolchainResult({ rustc: null, cargo: null }, false);
    assert.equal(result.ok, true);
    assert.equal(result.warn, true);
    assert.match(result.detail, /rustc and cargo not found on PATH/);
    assert.match(result.detail, /--with-desktop/);
  });

  it("fails when --with-desktop requires a missing binary", () => {
    const result = rustToolchainResult({ rustc: "rustc 1.88.0", cargo: null }, true);
    assert.equal(result.ok, false);
    assert.equal(result.detail, "cargo not found on PATH");
    assert.match(result.remediation ?? "", /rustup/);
  });
});
