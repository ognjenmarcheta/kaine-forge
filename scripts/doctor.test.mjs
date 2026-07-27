import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  missingEnvKeys,
  nodeSatisfiesEngine,
  pnpmMatchesPackageManager,
  REQUIRED_ENV_KEYS
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
