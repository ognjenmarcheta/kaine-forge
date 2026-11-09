// The bounded contexts of apps/api: which feature folders and `@repo/db/schema`
// tables each context owns, and which contexts it may import. CONTEXT.md
// "Context map" describes the same map in prose, and api-boundaries.test.js
// fails when the two disagree. See ADR 0025 and ADR 0026.
//
// List a context only after every context it uses, so the map cannot hold a cycle.

/**
 * @type {ReadonlyArray<{
 *   name: string,
 *   features: readonly string[],
 *   tables: readonly string[],
 *   uses: readonly string[]
 * }>}
 */
export const API_CONTEXTS = [
  // Who may reach an Organization and with which Permissions. Its tables are
  // better-auth's, listed in API_AUTH_TABLES.
  { name: "Tenancy & Access", features: ["organizations", "api-keys"], tables: [], uses: [] },
  // Plans, Subscriptions, Entitlements, and Seats.
  {
    name: "Billing",
    features: ["billing"],
    tables: ["billingCustomersTable", "billingSubscriptionsTable", "billingEventsTable"],
    uses: []
  },
  // The Organization's user-created data. A Todo checks its Plan limit.
  {
    name: "Content",
    features: ["todos", "notes"],
    tables: ["todosTable", "notesTable"],
    uses: ["Billing"]
  },
  // Stored objects: Attachments of a Todo, and Public Assets.
  {
    name: "Files",
    features: ["storage", "public-assets"],
    tables: ["filesTable", "organizationStoragePurgesTable", "publicAssetPurgesTable"],
    uses: ["Content"]
  },
  // Offline sync of Todos and Notes.
  {
    name: "Sync",
    features: ["sync"],
    tables: ["organizationSyncVersionsTable", "syncTombstonesTable", "syncMutationReceiptsTable"],
    uses: ["Content"]
  },
  // The assistant and the tools it calls on Content.
  {
    name: "Assistant",
    features: ["assistant"],
    tables: ["assistantConversationsTable", "assistantMessagesTable"],
    uses: ["Content"]
  },
  // Services that act on the whole Organization or the whole system.
  {
    name: "Platform",
    features: [
      "audit",
      "notifications",
      "webhooks",
      "feature-flags",
      "data-export",
      "housekeeping",
      "health"
    ],
    tables: [
      "auditEventsTable",
      "notificationsTable",
      "notificationPreferencesTable",
      "webhookEndpointsTable",
      "webhookDeliveriesTable",
      "featureFlagOverridesTable",
      "dataExportsTable"
    ],
    uses: ["Files"]
  }
];

/**
 * The tables better-auth reads and writes (`@repo/auth`). Like the package,
 * they are outside the map: every feature may import them.
 */
export const API_AUTH_TABLES = [
  "usersTable",
  "sessionsTable",
  "accountsTable",
  "verificationsTable",
  "organizationsTable",
  "membersTable",
  "invitationsTable",
  "organizationRolesTable",
  "twoFactorsTable",
  "apiKeysTable",
  "passkeysTable"
];

/**
 * Tables a feature reads although another context owns them, with the reason.
 * Every other table import must come from the feature's own context. Add an
 * entry only when going through the owner's module is not possible.
 *
 * @type {Readonly<Record<string, { tables: readonly string[], reason: string }>>}
 */
export const API_FOREIGN_TABLES = {
  storage: {
    tables: ["todosTable"],
    reason: "an Attachment checks its Todo; the Todo module already depends on Attachments"
  },
  sync: {
    tables: ["todosTable", "notesTable"],
    reason: "a pull reads the synced rows by their Sync Version"
  },
  "data-export": {
    tables: [
      "todosTable",
      "notesTable",
      "filesTable",
      "assistantConversationsTable",
      "assistantMessagesTable"
    ],
    reason: "an export copies every table of the Organization"
  },
  housekeeping: {
    tables: [
      "billingEventsTable",
      "filesTable",
      "organizationSyncVersionsTable",
      "syncTombstonesTable",
      "syncMutationReceiptsTable"
    ],
    reason: "retention deletes expired rows of every context"
  }
};

/**
 * The files another context may import from a feature, without extension. A
 * feature not listed here publishes `<feature>.module` and `<feature>.type`;
 * an entry replaces that default.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const API_PUBLIC_FILES = {
  storage: ["attachment.module", "attachment.store"]
};
