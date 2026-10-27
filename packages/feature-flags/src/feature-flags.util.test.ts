import { describe, expect, it } from "vitest";

import { FEATURE_FLAGS } from "./feature-flags.definition";
import {
  featureFlagsFromValues,
  isFeatureEnabled,
  parseFeatureFlagEnvironment,
  resolveFeatureFlags,
  resolveFlags
} from "./feature-flags.util";

// One flag of each kind, so the precedence rows do not depend on the shipped registry.
const REGISTRY = {
  locked: { defaultValue: true, organizationOverridable: false },
  open: { defaultValue: false, organizationOverridable: true }
};

describe("resolveFlags", () => {
  it.each([
    { layers: {}, expected: { locked: true, open: false } },
    { layers: { environment: { open: true } }, expected: { locked: true, open: true } },
    {
      layers: { environment: { open: true }, organization: [{ key: "open", enabled: false }] },
      expected: { locked: true, open: false }
    },
    {
      layers: { environment: { locked: false } },
      expected: { locked: false, open: false }
    }
  ])("applies default < environment < organization: $expected", ({ layers, expected }) => {
    expect(resolveFlags(REGISTRY, layers)).toEqual(expected);
  });

  it("ignores an organization override for a flag that is not overridable", () => {
    expect(
      resolveFlags(REGISTRY, {
        environment: { locked: false },
        organization: [{ key: "locked", enabled: true }]
      })
    ).toEqual({ locked: false, open: false });
  });

  it("ignores an organization override for a key outside the registry", () => {
    expect(resolveFlags(REGISTRY, { organization: [{ key: "retired", enabled: true }] })).toEqual({
      locked: true,
      open: false
    });
  });
});

describe("parseFeatureFlagEnvironment", () => {
  it("reads FEATURE_FLAG_<KEY> and skips blank values", () => {
    expect(
      parseFeatureFlagEnvironment(
        { FEATURE_FLAG_LOCKED: " FALSE ", FEATURE_FLAG_OPEN: "", OPEN: "true" },
        REGISTRY
      )
    ).toEqual({ locked: false });
  });

  it("throws a startup error that names every invalid variable", () => {
    expect(() =>
      parseFeatureFlagEnvironment({ FEATURE_FLAG_LOCKED: "yes", FEATURE_FLAG_OPEN: "1" }, REGISTRY)
    ).toThrow(
      'invalid feature flag environment: FEATURE_FLAG_LOCKED must be "true" or "false"; FEATURE_FLAG_OPEN must be "true" or "false"'
    );
  });
});

describe("featureFlagsFromValues", () => {
  it("keeps the registry default for a flag the values omit and drops unknown keys", () => {
    expect(featureFlagsFromValues([{ key: "retired", enabled: false }])).toEqual({
      organizations_visible: true
    });
    expect(
      featureFlagsFromValues([{ key: FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, enabled: false }])
    ).toEqual({ organizations_visible: false });
  });
});

describe("feature flags", () => {
  it("returns a copy of defaults on each resolve", () => {
    const first = resolveFeatureFlags();
    const second = resolveFeatureFlags();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("keeps organizations_visible on by default and closed to organization overrides", () => {
    const flags = resolveFeatureFlags({
      organization: [{ key: FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, enabled: false }]
    });

    expect(isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, flags)).toBe(true);
  });
});
