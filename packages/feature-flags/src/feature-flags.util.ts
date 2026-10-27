import { FEATURE_FLAG_REGISTRY, type FeatureFlagDefinition } from "./feature-flags.definition";
import type {
  FeatureFlagKey,
  FeatureFlagLayers,
  FeatureFlags,
  FeatureFlagValue
} from "./feature-flags.type";

type FlagRegistry<TKey extends string> = Readonly<Record<TKey, FeatureFlagDefinition>>;

function flagKeys<TKey extends string>(registry: FlagRegistry<TKey>): TKey[] {
  // SAFETY: a registry is a plain object literal, so Object.keys lists exactly
  // its own keys, which are TKey.
  return Object.keys(registry) as TKey[];
}

function mapFlags<TKey extends string>(
  registry: FlagRegistry<TKey>,
  valueOf: (key: TKey, definition: FeatureFlagDefinition) => boolean
): Record<TKey, boolean> {
  const entries = flagKeys(registry).map((key) => [key, valueOf(key, registry[key])]);
  // SAFETY: entries holds one value for every registry key, so the object is a full Record.
  return Object.fromEntries(entries) as Record<TKey, boolean>;
}

/** The environment variable that overrides `key` for the whole process. */
export function featureFlagEnvironmentVariable(key: string): string {
  return `FEATURE_FLAG_${key.toUpperCase()}`;
}

/**
 * Resolves every flag in `registry` as default < environment < Organization
 * override. An override for a flag that does not allow one, or for a key
 * outside the registry, has no effect.
 */
export function resolveFlags<TKey extends string>(
  registry: FlagRegistry<TKey>,
  layers: FeatureFlagLayers<TKey> = {}
): Record<TKey, boolean> {
  const organization = new Map(layers.organization?.map(({ key, enabled }) => [key, enabled]));

  return mapFlags(
    registry,
    (key, definition) =>
      (definition.organizationOverridable ? organization.get(key) : undefined) ??
      layers.environment?.[key] ??
      definition.defaultValue
  );
}

/**
 * Reads `FEATURE_FLAG_<KEY>` for each flag in `registry`. A blank value is
 * unset; any value other than `true` or `false` throws, so a typo fails startup.
 */
export function parseFeatureFlagEnvironment<TKey extends string>(
  env: Readonly<Record<string, string | undefined>>,
  registry: FlagRegistry<TKey>
): Partial<Record<TKey, boolean>> {
  const flags: Partial<Record<TKey, boolean>> = {};
  const errors: string[] = [];

  for (const key of flagKeys(registry)) {
    const variable = featureFlagEnvironmentVariable(key);
    const value = env[variable]?.trim().toLowerCase();

    if (value === "true" || value === "false") {
      flags[key] = value === "true";
    } else if (value) {
      errors.push(`${variable} must be "true" or "false"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid feature flag environment: ${errors.join("; ")}`);
  }

  return flags;
}

export function resolveFeatureFlags(layers: FeatureFlagLayers = {}): FeatureFlags {
  return resolveFlags(FEATURE_FLAG_REGISTRY, layers);
}

/** Flags resolved elsewhere, such as by the API; a missing flag keeps its default. */
export function featureFlagsFromValues(values: readonly FeatureFlagValue[]): FeatureFlags {
  const resolved = new Map(values.map(({ key, enabled }) => [key, enabled]));

  return mapFlags(
    FEATURE_FLAG_REGISTRY,
    (key, definition) => resolved.get(key) ?? definition.defaultValue
  );
}

export function isFeatureEnabled(featureFlag: FeatureFlagKey, flags?: FeatureFlags): boolean {
  return (flags ?? resolveFeatureFlags())[featureFlag];
}
