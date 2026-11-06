// The bounded contexts of apps/api: which feature folders each context owns,
// and which contexts it may import. CONTEXT.md "Context map" describes the same
// map in prose, and api-boundaries.test.js fails when the two disagree. See ADR 0025.
//
// List a context only after every context it uses, so the map cannot hold a cycle.

/** @type {ReadonlyArray<{ name: string, features: readonly string[], uses: readonly string[] }>} */
export const API_CONTEXTS = [
  // Who may reach an Organization and with which Permissions.
  { name: "Tenancy & Access", features: ["organizations", "api-keys"], uses: [] },
  // Plans, Subscriptions, Entitlements, and Seats.
  { name: "Billing", features: ["billing"], uses: [] },
  // The Organization's user-created data. A Todo checks its Plan limit.
  { name: "Content", features: ["todos", "notes"], uses: ["Billing"] },
  // Stored objects: Attachments of a Todo, and Public Assets.
  { name: "Files", features: ["storage", "public-assets"], uses: ["Content"] },
  // Offline sync of Todos and Notes.
  { name: "Sync", features: ["sync"], uses: ["Content"] },
  // The assistant and the tools it calls on Content.
  { name: "Assistant", features: ["assistant"], uses: ["Content"] },
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
    uses: ["Files"]
  }
];

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
