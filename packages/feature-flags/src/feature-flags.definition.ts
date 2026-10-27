/** How one flag behaves before any override. */
export interface FeatureFlagDefinition {
  readonly defaultValue: boolean;
  /** Whether an owner or admin may override the flag for their Organization. */
  readonly organizationOverridable: boolean;
}

/**
 * Every feature flag. A flag resolves as its default, then the environment
 * variable `FEATURE_FLAG_<KEY>`, then the Active Organization's override when
 * the flag allows one.
 */
export const FEATURE_FLAG_REGISTRY = {
  // Decides whether organization UI shows at all, before an Active
  // Organization is known, so an Organization cannot override it.
  organizations_visible: { defaultValue: true, organizationOverridable: false }
} as const satisfies Readonly<Record<string, FeatureFlagDefinition>>;

export const FEATURE_FLAGS = {
  ORGANIZATIONS_VISIBLE: "organizations_visible"
} as const satisfies Readonly<Record<string, keyof typeof FEATURE_FLAG_REGISTRY>>;
