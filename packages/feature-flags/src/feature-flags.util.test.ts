import { describe, expect, it } from "vitest";

import { DEFAULT_FLAGS } from "./feature-flags.config";
import { FEATURE_FLAGS } from "./feature-flags.definition";
import { isFeatureEnabled, resolveFeatureFlags } from "./feature-flags.util";

describe("feature flags", () => {
  it("resolves the code-defined default flags", () => {
    expect(resolveFeatureFlags()).toEqual(DEFAULT_FLAGS);
  });

  it("returns a copy of defaults on each resolve", () => {
    const first = resolveFeatureFlags();
    const second = resolveFeatureFlags();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("checks feature values using typed feature keys", () => {
    const flags = resolveFeatureFlags();

    expect(isFeatureEnabled(FEATURE_FLAGS.ORGANIZATIONS_VISIBLE, flags)).toBe(true);
  });
});
