---
"@repo/feature-flags": minor
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/auth": minor
"@repo/translation": minor
---

Feature flags now resolve at runtime in three layers: the registry default, then the `FEATURE_FLAG_<KEY>` environment variable for the whole API process, then the Active Organization's override for a flag that allows one. `@repo/feature-flags` adds the typed `FEATURE_FLAG_REGISTRY` (key, default, `organizationOverridable`), `resolveFlags`, `parseFeatureFlagEnvironment`, and `featureFlagsFromValues`, and `unknownFeatureFlagVariables`; `resolveFeatureFlags()` without arguments still returns the defaults, so mobile is unchanged. `organizations_visible` keeps default `true` and does not allow an Organization override. An invalid `FEATURE_FLAG_*` value fails API startup, and a `FEATURE_FLAG_*` variable that names no flag logs a warning at boot.

The API resolves flags once per request into `ctx.featureFlags`. The new `featureFlags` GraphQL query returns them for the signed-in session, with the Active Organization's overrides when it has one; owners and admins set and clear an override with `setFeatureFlagOverride` and `clearFeatureFlagOverride` (a member gets `admin role required`), and each change records a `feature_flag_override_changed` Audit Event (a repeat of the current value records none). `@repo/db` migration `0018` adds the `feature_flag_overrides` table. The web `OrganizationProvider` reads the query, keyed by the Active Organization. Until it succeeds, the provider reports loading, keeps organization UI hidden, and does not restore the remembered Organization.
