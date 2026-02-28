import { FEATURE_FLAGS } from "./feature-flags.definition";

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;
