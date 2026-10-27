/**
 * The API's featureFlags answer at the registry defaults, or null for any
 * other operation. Every GraphQL mock that renders the shell answers it,
 * because the web OrganizationProvider reads it before it renders
 * organization UI.
 */
export function featureFlagData(query: string): Record<string, unknown> | null {
  if (query.includes("query FeatureFlags")) {
    return { featureFlags: [{ key: "organizations_visible", enabled: true }] };
  }

  return null;
}
