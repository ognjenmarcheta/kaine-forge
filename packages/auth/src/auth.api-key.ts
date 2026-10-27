import { apiKey } from "@better-auth/api-key";

import { AUTH_DEFINITIONS } from "./auth.definition";
import { permissionsOfStatements, type Permission } from "./auth.permissions";

/**
 * Organization-owned API Keys. better-auth stores the SHA-256 hash of each key
 * and returns the plain key once, from create. The API manages keys through
 * GraphQL with the Active Organization from the session, so the plugin's own
 * HTTP routes, which accept a client organization id, are off.
 */
export function apiKeyPlugin() {
  const plugin = apiKey(
    {
      references: "organization",
      defaultPrefix: AUTH_DEFINITIONS.API_KEY_PREFIX,
      // The prefix plus enough characters for a person to tell keys apart.
      startingCharactersConfig: { charactersLength: AUTH_DEFINITIONS.API_KEY_START_LENGTH },
      maximumNameLength: AUTH_DEFINITIONS.API_KEY_NAME_MAX_LENGTH,
      requireName: true,
      // Holds the creating user's id; only the server writes it.
      enableMetadata: true,
      keyExpiration: {
        defaultExpiresIn: null,
        maxExpiresIn: AUTH_DEFINITIONS.API_KEY_MAX_EXPIRES_IN_DAYS
      },
      // Each key has its own bucket in the API's request limiter.
      rateLimit: { enabled: false }
    },
    { schema: { apikey: { fields: { referenceId: "organizationId" } } } }
  );

  // Only the two server calls the API makes. The list, get, update, and
  // delete routes stay unregistered, and so does the hook that turns a key
  // into a Session (enableSessionForAPIKeys is off, so it never matches).
  return {
    id: plugin.id,
    version: plugin.version,
    $ERROR_CODES: plugin.$ERROR_CODES,
    schema: plugin.schema,
    endpoints: {
      createApiKey: plugin.endpoints.createApiKey,
      verifyApiKey: plugin.endpoints.verifyApiKey
    }
  };
}

/** The plugin's one HTTP route; disabledPaths turns it off, server calls still work. */
export const API_KEY_HTTP_PATHS = ["/api-key/create"];

/**
 * The Permissions a new key grants: its creator's, without API Key
 * management, so a key cannot mint or revoke keys.
 */
export function grantedApiKeyPermissions(creatorPermissions: readonly Permission[]): Permission[] {
  return creatorPermissions.filter((permission) => !permission.startsWith("apiKey:"));
}

/** The Permissions a stored key grants, from its resource → actions map. */
export function storedApiKeyPermissions(
  statements: Readonly<Record<string, unknown>> | null
): Permission[] {
  return grantedApiKeyPermissions(permissionsOfStatements(statements ?? {}));
}
