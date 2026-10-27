import { FEATURE_FLAG_REGISTRY } from "./feature-flags.definition";

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_REGISTRY;

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

/** One flag's value: an Organization override row, or a resolved flag from the API. */
export interface FeatureFlagValue {
  key: string;
  enabled: boolean;
}

/** The layers above the registry defaults, lowest precedence first. */
export interface FeatureFlagLayers<TKey extends string = FeatureFlagKey> {
  environment?: Partial<Record<TKey, boolean>>;
  /** The Active Organization's overrides; ignored for a flag that does not allow one. */
  organization?: readonly FeatureFlagValue[];
}
