import { DEFAULT_FLAGS } from "./feature-flags.config";
import type { FeatureFlagKey, FeatureFlags } from "./feature-flags.type";

export function resolveFeatureFlags(): FeatureFlags {
  return { ...DEFAULT_FLAGS };
}

export function isFeatureEnabled(
  featureFlag: FeatureFlagKey,
  flags: FeatureFlags = DEFAULT_FLAGS
): boolean {
  return flags[featureFlag];
}
