import { FEATURE_FLAG_REGISTRY } from "@repo/feature-flags";

// The enum lists every registry key, so the API and the registry cannot drift.
export const featureFlagsTypeDefs = /* GraphQL */ `
  enum FeatureFlagKey {
    ${Object.keys(FEATURE_FLAG_REGISTRY).join("\n    ")}
  }

  type FeatureFlag {
    key: FeatureFlagKey!
    enabled: Boolean!
  }

  extend type Query {
    # Every flag resolved for the session: default, then environment, then the
    # Active Organization's override when the session has one. Signed-in users
    # only. Bounded by the registry, so it is not paged.
    featureFlags: [FeatureFlag!]!
  }

  extend type Mutation {
    # Owners and admins only, for a flag that allows an Organization override.
    setFeatureFlagOverride(key: FeatureFlagKey!, enabled: Boolean!): [FeatureFlag!]!
    clearFeatureFlagOverride(key: FeatureFlagKey!): [FeatureFlag!]!
  }
`;
