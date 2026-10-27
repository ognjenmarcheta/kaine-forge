import type { AuditEventInput } from "@repo/auth/audit";
import {
  requireOrganizationPermission,
  type AuthenticatedOrganizationScope
} from "@repo/auth/scope";
import { featureFlagOverridesTable } from "@repo/db/schema";
import {
  FEATURE_FLAG_REGISTRY,
  parseFeatureFlagEnvironment,
  resolveFlags,
  type FeatureFlagKey,
  type FeatureFlags
} from "@repo/feature-flags";
import { eq, inArray, ne, sql } from "drizzle-orm";
import { GraphQLError } from "graphql";

import type { ScopedData } from "../../context.data";

// validateApiEnv parses the same variables at startup and exits on a bad one,
// so this cannot throw in a started API.
const environmentFlags = parseFeatureFlagEnvironment(process.env, FEATURE_FLAG_REGISTRY);

const overridableKeys = Object.entries(FEATURE_FLAG_REGISTRY).flatMap(([key, definition]) =>
  definition.organizationOverridable ? [key] : []
);

/** One resolved flag, as the GraphQL `FeatureFlag` type returns it. */
export interface FeatureFlagView {
  key: string;
  enabled: boolean;
}

/** The Active Organization's feature flag overrides; owners and admins write them. */
export interface FeatureFlagOverrides {
  /** Sets the override and returns the Active Organization's resolved flags. */
  set: (key: FeatureFlagKey, enabled: boolean) => Promise<FeatureFlagView[]>;
  /** Removes the override, if any, and returns the Active Organization's resolved flags. */
  clear: (key: FeatureFlagKey) => Promise<FeatureFlagView[]>;
}

export interface FeatureFlagOverridesDeps {
  data: ScopedData;
  recordAuditEvent: (event: AuditEventInput) => Promise<void>;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}

/**
 * Resolves every flag for one request: default < environment < the Active
 * Organization's override. Without an Active Organization, or while no flag
 * allows an override, it reads no rows.
 */
export async function resolveRequestFeatureFlags(
  data: ScopedData,
  organizationScope: AuthenticatedOrganizationScope | null
): Promise<FeatureFlags> {
  const organization =
    organizationScope && overridableKeys.length > 0
      ? await data
          .selectFrom(
            featureFlagOverridesTable,
            inArray(featureFlagOverridesTable.flagKey, overridableKeys)
          )
          .then((rows) => rows.map((row) => ({ key: row.flagKey, enabled: row.enabled })))
      : [];

  return resolveFlags(FEATURE_FLAG_REGISTRY, { environment: environmentFlags, organization });
}

export function toFeatureFlagViews(flags: Readonly<Record<string, boolean>>): FeatureFlagView[] {
  return Object.entries(flags).map(([key, enabled]) => ({ key, enabled }));
}

export function createFeatureFlagOverrides({
  data,
  recordAuditEvent,
  requireOrganizationScope
}: FeatureFlagOverridesDeps): FeatureFlagOverrides {
  function requireOverride(key: FeatureFlagKey): AuthenticatedOrganizationScope {
    const scope = requireOrganizationScope();

    requireOrganizationPermission(scope, "featureFlag:update");

    if (!FEATURE_FLAG_REGISTRY[key].organizationOverridable) {
      throw new GraphQLError("feature flag does not allow an organization override", {
        extensions: { code: "BAD_USER_INPUT" }
      });
    }

    return scope;
  }

  async function resolved(scope: AuthenticatedOrganizationScope): Promise<FeatureFlagView[]> {
    return toFeatureFlagViews(await resolveRequestFeatureFlags(data, scope));
  }

  return {
    async set(key, enabled) {
      const scope = requireOverride(key);

      // An existing row with the same value is left alone and returns
      // nothing, so a repeat records no Audit Event.
      const changed = await data
        .insert(featureFlagOverridesTable)
        .values({ ...data.stamp(), flagKey: key, enabled })
        .onConflictDoUpdate({
          target: [featureFlagOverridesTable.organizationId, featureFlagOverridesTable.flagKey],
          set: { enabled, updatedAt: sql`now()` },
          setWhere: ne(featureFlagOverridesTable.enabled, enabled)
        })
        .returning({ flagKey: featureFlagOverridesTable.flagKey });

      if (changed.length > 0) {
        await recordAuditEvent({
          action: "feature_flag_override_changed",
          actorUserId: scope.userId,
          metadata: { enabled, flag: key },
          organizationId: scope.organizationId,
          targetId: scope.organizationId
        });
      }

      return resolved(scope);
    },
    async clear(key) {
      const scope = requireOverride(key);
      const removed = await data
        .delete(featureFlagOverridesTable, eq(featureFlagOverridesTable.flagKey, key))
        .returning({ flagKey: featureFlagOverridesTable.flagKey });

      if (removed.length > 0) {
        await recordAuditEvent({
          action: "feature_flag_override_changed",
          actorUserId: scope.userId,
          metadata: { enabled: null, flag: key },
          organizationId: scope.organizationId,
          targetId: scope.organizationId
        });
      }

      return resolved(scope);
    }
  };
}
