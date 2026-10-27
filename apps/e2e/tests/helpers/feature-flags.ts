/**
 * The API's featureFlags answer at the registry defaults. Helpers that mock
 * every GraphQL operation return it, because the web OrganizationProvider
 * reads it before it renders organization UI.
 */
export const FEATURE_FLAGS_RESPONSE = {
  data: { featureFlags: [{ key: "organizations_visible", enabled: true }] }
};
