# @repo/api

## 2.4.0

### Minor Changes

- 214c6cc: Add Paddle billing. With `BILLING_PROVIDER=paddle`, `startCheckout` creates a Paddle transaction for
  the Paddle.js overlay checkout, `openBillingPortal` opens the Paddle customer portal, and
  `POST /api/billing/webhooks/paddle` verifies and stores Paddle subscription events the same way as
  Stripe's. The `billing` query returns the Paddle client token and environment for the browser
  checkout. An owner's Organizations share one Paddle customer, because Paddle keeps one customer per
  email address.
- 5659f20: Add billing Plans and Plan gates. The new `@repo/billing` package holds the Plan catalog (free,
  pro, business, and unlimited while billing is off) and resolves an Organization's Entitlements
  from its subscriptions. The API adds a `billing` query, refuses a Todo past the Plan's todo limit
  with `PLAN_LIMIT_REACHED`, and refuses the assistant on a Plan without it with
  `PLAN_FEATURE_REQUIRED`. `BILLING_PROVIDER` defaults to `none`, which gives every Organization the
  unlimited Plan. The database adds the billing customer, subscription, and event tables, and the
  owner role gains the owner-only `billing:manage` Permission.
- 63d8df4: Sync per-seat billing and cancel subscriptions of deleted Organizations. Adding or removing a
  member queues a `billing.syncSeats` job, which sets a per-seat subscription's provider quantity to
  the member count and retries while the provider is unavailable. A reconcile sweep corrects
  quantities that drifted without a hook, such as after a member leaves. Deleting an Organization,
  directly or with the owner's account, cancels its paid subscriptions first and fails with
  `BILLING_CANCEL_FAILED` when the provider refuses. `@repo/auth/billing` holds the hooks the API sets.
- 474e9c1: Add Stripe billing. With `BILLING_PROVIDER=stripe`, an organization owner starts a Stripe Checkout
  with the `startCheckout` mutation and opens the Stripe Billing Portal with `openBillingPortal`.
  `POST /api/billing/webhooks/stripe` verifies each Stripe event, refetches the subscription from
  Stripe, and stores its current state, so repeated or out-of-order events cannot corrupt it; a
  price outside the catalog answers 500 so Stripe retries. Checkout, portal, and webhook changes
  write Audit Events, and housekeeping purges processed billing event ids after 30 days.
- 718e2e7: Add the server half of offline sync for Todos and Notes. Every write to `todos` and `notes` now
  gets a per-organization Sync Version from a trigger, and a delete leaves a Tombstone. The new
  `syncPull(cursor, first)` query returns the changes after a cursor. The new
  `syncPush(input)` mutation applies an Outbox batch once per idempotency key and accepts
  client-generated ids. `Todo` gains a `noteId` field. Housekeeping prunes old Tombstones and push
  receipts (`RETENTION_SYNC_TOMBSTONES_DAYS`, `RETENTION_SYNC_RECEIPTS_DAYS`).

### Patch Changes

- 9f5af06: Raise `decode-uri-component` to 0.5.1 (GHSA-qr28-fpjm-wq7f, GHSA-vcc3-ghjq-m6fr) for deep link query parsing, with a `query-string@7.1.3` patch that reads its ESM default export, and raise `seroval` to 1.7.2 (GHSA-9wx9-5pv9-3349, GHSA-f86p-h4j2-7qgj, GHSA-3pfx-gxff-vg76).
- 58e7b6f: Add a real-Postgres test that proves Sync Versions commit in order under concurrent writers: a
  paging sync pull misses no change, and one Organization's writes never wait on another's. It
  runs in CI's e2e job (issue #803). `@repo/db/testing` gains `createPostgresTestDatabase`.
- Updated dependencies [214c6cc]
- Updated dependencies [5659f20]
- Updated dependencies [63d8df4]
- Updated dependencies [474e9c1]
- Updated dependencies [4bf3bde]
- Updated dependencies [718e2e7]
- Updated dependencies [6f6690c]
- Updated dependencies [6980f5e]
- Updated dependencies [58e7b6f]
  - @repo/billing@0.1.0
  - @repo/auth@5.2.0
  - @repo/db@2.2.0
  - @repo/jobs@1.1.0
  - @repo/translation@1.14.0
  - @repo/email@1.3.3

## 2.3.0

### Minor Changes

- e64ae54: Add the Organization Theme: every member of an Organization sees the theme it picks. The `organizations` table gains a nullable `theme` column (migration `0025`). The API adds the `organizationTheme` query and the `setOrganizationTheme(theme: String)` mutation. The mutation needs the `organization:update` Permission, accepts only registered theme names, and records an `organization_theme_changed` Audit Event when the value changes. Organization settings show a Theme section when more than one theme is registered. The web and mobile apps apply the theme at runtime, and signed-out pages use the default theme.

### Patch Changes

- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
  - @repo/theme@0.1.0
  - @repo/db@2.1.0
  - @repo/auth@5.1.0
  - @repo/translation@1.13.0
  - @repo/email@1.3.2
  - @repo/jobs@1.0.2
  - @repo/feature-flags@1.2.0
  - @repo/logger@1.2.1
  - @repo/storage@1.6.0

## 2.2.0

### Minor Changes

- 4dcc509: Avatars and organization logos accept AVIF images. `@repo/storage` recognises the AVIF file signature and the `.avif` extension; the API decodes AVIF and publishes it as the usual square WebP. Image Attachments still accept only JPEG, PNG, GIF, and WebP; document and spreadsheet Attachments are unchanged. AVIF image sequences (`avis`) are rejected, because the image library cannot decode them.
- 0100b46: `@repo/api` adds `uploadsEnabled: Boolean!` to the `PublicAssets` type. It is false when `S3_PUBLIC_BUCKET` or `S3_PUBLIC_BASE_URL` is unset. A Public Asset upload to such a deployment now fails with the GraphQL error code `PUBLIC_ASSETS_NOT_CONFIGURED` instead of a masked internal error.

  `@repo/web` hides the "Choose image" control for the profile picture and the organization logo when uploads are off, and shows a short note instead of "The image could not be saved" for every image.

- a26fb69: The signed-in web app is redesigned for clearer navigation and safer actions.

  `@repo/web`: the sidebar groups pages into Workspace (Dashboard, Todos, Notes, Assistant) and Organization (Organization, Audit log). Organization and Account settings are tabbed pages whose tab is in the URL: `/organization/{general,members,roles,data}` and `/account/{profile,security,sessions,notifications,data}`. The old `/members` and `/security` links redirect to the matching tab. The dashboard shows the Active Organization's open Todo, Note, and unread notification counts, a quick add for open Todos, and recent Notes, chats, and activity with "View all" links. Revoking an Invitation, changing a member's role, signing out one or all other sessions, unlinking a sign-in method, declining an Invitation, and requesting account deletion now ask for confirmation and report success. The header has a "Search…" button and a Cmd/Ctrl+K command menu to go to a page, open a settings tab, create an item, switch Organization, or change theme and language. The sign-in page's login and sign-up choice is a link pair kept in `?mode=signup`.

  `@repo/api`: GraphQL adds `todoCounts` (`open`, `completed`) and `noteCount`, both counted in the Active Organization from the session.

  `@repo/ui` adds `PageHeader`, `EmptyState`, `QueryError`, `SettingsSection`, `StatCard`, `CopyButton`, and `CommandMenu` (built on `cmdk`), and exports `tabsListClassName` and `tabsTriggerClassName` for link-based tab navigation. The active sidebar item uses the selected tokens with an inset start indicator.

  `@repo/translation` adds the strings for the new navigation, dashboard, confirmations, and command menu.

### Patch Changes

- Updated dependencies [4dcc509]
- Updated dependencies [0100b46]
- Updated dependencies [a26fb69]
  - @repo/storage@1.6.0
  - @repo/translation@1.12.0
  - @repo/auth@5.0.2
  - @repo/email@1.3.1
  - @repo/jobs@1.0.1

## 2.1.0

### Minor Changes

- 5f59692: `@repo/api` adds `API_TRUSTED_PROXY_HOPS` (positive integer, default 1, read only with `API_TRUST_PROXY=true`). The client IP for rate limits, Audit Events, and sessions is the `x-forwarded-for` entry that many positions from the right, so a platform proxy in front of the web image's nginx (Traefik → nginx → API) needs `2`. A request with fewer entries than hops uses the socket address instead of a client-supplied entry. `RateLimitConfig` gains a required `trustedProxyHops`, and `resolveRateLimitKey` takes `{ trustProxy, trustedProxyHops }` in place of the `trustProxy` boolean.

  `@repo/auth` records a new session's IP address from the API's request IP when one is set, instead of better-auth's own `x-forwarded-for` parsing, which found no IP behind two proxies.

### Patch Changes

- Updated dependencies [5f59692]
  - @repo/auth@5.0.1

## 2.0.0

### Major Changes

- 9efcac9: Breaking GraphQL change: the `todos`, `notes`, `conversations`, `assistantMessages`, and `files` list fields take `first: Int` and `after: String` instead of `limit` and `offset`, and return a `<Type>Connection` (`TodoConnection`, `NoteConnection`, `AssistantConversationConnection`, `AssistantMessageConnection`, `FileInfoConnection`) with `items` and the shared `pageInfo { hasNextPage endCursor }`. `FilesFilterInput` no longer has `limit` or `offset`. The `auditEvents` query keeps `first` and `after` but returns `AuditEventConnection` (`items`, `pageInfo`) instead of `AuditEventPage` (`events`, `endCursor`, `hasNextPage`). Pass the previous page's `endCursor` as `after` to read the next page. A cursor is opaque and pages by the list's sort key plus `id`, so rows inserted or deleted between two requests no longer shift or repeat a page. A malformed cursor, or one from another list or another Organization, returns the GraphQL error `invalid cursor` (`BAD_USER_INPUT`). The web Todo, Note, assistant, and audit-log lists and the mobile Todo list use the new shape; their UI does not change.

### Minor Changes

- 729d942: A signed-in user now manages their own account on the web app's new `/account` page, opened from the sidebar user menu: avatar and display name, email address, password, signed-in sessions, linked sign-in methods, and account deletion. The avatar uploader moves there from `/security`, which keeps two-step verification only.

  `@repo/auth` turns on better-auth `user.changeEmail` (`updateEmailWithoutVerification: false`, so the email changes only after the new address is verified; a verified user's old address approves the change first) and `user.deleteUser` with an emailed confirmation link to `<WEB_APP_URL>/account/delete?token=…`. Deletion is refused with `SOLE_OWNER_OF_SHARED_ORGANIZATION` or `PERSONAL_ORGANIZATION_HAS_MEMBERS`, and the error body carries `organizationName`. In one locked transaction before the user row goes, the Organizations the user is alone in are deleted (their storage is queued for the sweep) and a shared, non-personal Organization's `user_id` moves to another owner. New `GET /account/social-providers` lists the providers the server configured. `AuthTransport` gains `updateProfile`, `changePassword`, `changeEmail`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `listAccounts`, `listSocialProviders`, `linkSocialAccount`, `unlinkAccount`, `requestAccountDeletion` and `confirmAccountDeletion`; `AuthRequestError` gains `organizationName`. Breaking: `/sign-up/email` and `/update-user` refuse `image`, and `/organization/create` and `/organization/update` refuse `logo`, with `PUBLIC_ASSET_URL_READ_ONLY`. Only the API's Public Asset upload writes those URLs, because a client-chosen URL could name another owner's file.

  `@repo/db` breaking change: migration `0017` makes `files.uploaded_by` and `organizations.user_id` nullable with `ON DELETE SET NULL`, so `File.uploadedBy` and `Organization.userId` are `string | null`. An Attachment stays with its Organization after its uploader deletes their account, and an Organization that reaches a user while their account is being deleted survives with its members. The migration also adds a `public_asset_purges` queue (user id and image URL) that a trigger fills for every deleted user.

  `@repo/api`: new avatars and logos are published under `avatars/<userId>/` and `organization-logos/<organizationId>/`. Replacing a Public Asset, purging a deleted Organization's logo, and the new sweep of deleted users' avatars delete an object only when its key belongs to that owner. A legacy key without an owner is left in the bucket.

  `@repo/email` adds the `emailChangeApproval` and `accountDeletion` templates (en, sr, de) for these emails.

  `@repo/ui`: `NavUser` takes an optional `accountItem` menu entry above log out.

- 1e5e82d: Organizations get API Keys and Webhook Endpoints (#709).

  `@repo/auth` registers the official `@better-auth/api-key` add-on (catalog `1.7.12`) with `references: "organization"`. Only its create and verify endpoints are registered, and `/api-key/create` is in `disabledPaths`, so keys are managed through GraphQL with the Active Organization from the session. The add-on stores the SHA-256 hash of each key and returns the plain key (prefix `kf_`) once. The Permission catalog gains `apiKey:create`, `apiKey:read`, `apiKey:delete`, `webhook:create`, `webhook:read`, `webhook:update` and `webhook:delete`, granted to owner and admin and grantable by Custom Roles. A key grants its creator's Permissions except access changes (`apiKeyGrantablePermissions`: no API Key, Webhook Endpoint, role, member, invitation or Organization changes, and no Organization export); `resolveApiKeyScope` builds an Authenticated Organization Scope for the key's Organization whose Permissions are the ones the key grants that the creator still holds, and marks it with `apiKeyId`. An Audit Event recorded under a key request names the key in its metadata. Breaking: `ServerAuth` gains `resolveApiKey` and `createApiKey`, so every implementation and test fake needs them. New Audit Event actions: `api_key_created`, `api_key_revoked`, `webhook_endpoint_created`, `webhook_endpoint_updated`, `webhook_endpoint_deleted`, `webhook_secret_rotated`.

  `@repo/jobs` adds the `webhook.deliver` job (6 attempts, exponential backoff from 30 s). Breaking: `createJobHandlers` requires a `deliverWebhook` handler.

  `@repo/db` migration adds `api_keys`, `webhook_endpoints` and `webhook_deliveries`.

  `@repo/api`: a `/graphql` request with an `x-api-key` header acts as the key's Organization, with its own rate limit bucket; an unknown, revoked or expired key gets 401, a client over its address limit gets 429 before any key lookup, and a malformed key never reaches the database. A key request lists only its own Organization and cannot read its creator's own data. New GraphQL fields `apiKeys`, `createApiKey`, `revokeApiKey`, `webhookEventTypes`, `webhookEndpoints`, `webhookDeliveries`, `createWebhookEndpoint`, `updateWebhookEndpoint`, `rotateWebhookSecret` and `deleteWebhookEndpoint`, and `AuditEvent.apiKeyId`. Webhook URLs must use port 443, and Audit Events record them without the query string. Every organization event (`todo:*`, `note:*`) is delivered to the Organization's subscribed Webhook Endpoints as a JSON POST signed with HMAC-SHA256 over `<timestamp>.<body>`. An SSRF guard refuses loopback, private, link-local and unique-local IPv4 and IPv6 addresses at create, update and every attempt, connects to the checked address, and never follows redirects. Each attempt is written to the delivery log, which housekeeping deletes after `RETENTION_WEBHOOK_DELIVERIES_DAYS` (30).

  `@repo/web` adds the `/api-keys` and `/webhooks` pages, shown to members who hold the read Permission. `@repo/ui` exports the `KeyRound` and `Webhook` icons. `@repo/translation` adds their strings in en, sr and de. `@repo/logger` redacts the `x-api-key` header.

- a54d7ff: Users can export their own data, owners can export the Active Organization's data, and API housekeeping now applies retention windows.

  An export runs as the `data.export` job on `@repo/jobs` and writes one zip to the private bucket: a JSON file per entity plus `files-manifest.json` (each uploaded Attachment's key, name, content type, and size; no bytes). A user export holds the profile, current Organization Memberships, and the user's own todos, notes, assistant conversations and messages (without tool results, which can quote other members' content), and Attachment metadata, in the Organizations they still belong to. An Organization export holds the Organization, its members, Custom Roles, Invitations, todos, notes, and Attachment metadata, but no assistant conversations: they are private to their author, who exports them with a user export. Archives never hold a password hash, session token, OAuth token, or two-factor secret. `SECURITY.md` lists each file.

  GraphQL adds `dataExports(kind, first, after)`, `requestDataExport(kind)`, and `dataExportDownloadUrl(id)`. The organization kind needs the new owner-only `organization:export` Permission and takes the Organization from the session. One pending or running export per user and export kind (not per Organization); a second request fails with code `DATA_EXPORT_IN_PROGRESS`. When the archive is ready, the requester gets the new `dataExportReady` email, and account settings and organization settings show a download action (a presigned URL). Each Organization export records an `organization_exported` Audit Event, and each of its download links an `organization_export_downloaded` Audit Event. An export whose JSON passes 256 MiB fails with `failureReason: too_large` (streaming is issue #753).

  Housekeeping (advisory lock, one replica at a time) deletes a ready archive after `DATA_EXPORT_ARCHIVE_DAYS` (7) and marks its export `expired`, failed and expired export rows after `RETENTION_DATA_EXPORTS_DAYS` (30), purged Attachment rows after `RETENTION_PURGED_FILES_DAYS` (30), Audit Events after `RETENTION_AUDIT_EVENTS_DAYS` (365), and Notifications after `RETENTION_NOTIFICATIONS_DAYS` (90). An export stuck pending or running for a day is marked failed. `startHousekeeping` now takes a `run` function.

  `@repo/db` migration `0022` adds `data_exports`. `@repo/jobs` `createJobHandlers` now requires a `dataExport` handler. The API adds `jszip` from the catalog.

- 8be54b9: Signed-in users now get Notifications. Two types exist: "invitation received" (an Invitation to an email address that already has an account) and "role changed" (a role update, or becoming owner through an ownership transfer). The API registry (`apps/api/src/features/notifications/notifications.definition.ts`) declares each type's payload shape, default channels, and whether it has an email channel.

  The web header has a bell with an unread badge and an inbox; account settings has a per-type in-app and email choice. GraphQL adds `notifications(first, after)` (the caller's own Notifications in every Organization, newest first, with `unreadCount`), `notificationPreferences`, `markNotificationRead(id)`, `markAllNotificationsRead`, `updateNotificationPreference(input)`, and the `notificationReceived` subscription, filtered by the recipient's user id. None takes a user or organization id; another user's Notification id returns `notification not found`.

  The invitation email still always goes to the invited address, whatever the preferences, so "invitation received" is in-app only (`emailAvailable: false`). Only a verified account with that address gets the in-app Notification: under soft verification an unverified account may not own the address. An address without an account gets the email as before. A resend creates a new Notification. Delivery never blocks or fails the auth action that produced it.

  `@repo/auth` adds `@repo/auth/notifications` (event types and `setNotificationDispatcher`); the API process sets the dispatcher at startup. `@repo/db` migration `0018` adds `notifications` (with a partial index for unread rows) and `notification_preferences`. `@repo/email` adds the `roleChanged` template. `@repo/translation` adds the `notifications` namespace. `@repo/ui` exports the `Bell` icon. The shared cursor helper gains `pageOwnedByUser` for user-owned lists.

- a9cc2b2: Security-relevant and membership actions now write an Audit Event: member invited, member joined, member removed, member left, member role changed, ownership transferred, Organization renamed, Organization deleted, Invitation revoked, Attachment deleted, and, as user-level events with no Organization, two-factor turned on, two-factor turned off, and password changed. Each event stores the actor, the target, typed metadata, the client IP under the rate limiter's proxy rule, the user agent, and the time. A failed audit write is logged and never fails the action.

  Owners and admins read the Active Organization's Audit Events through the new `auditEvents(first, after)` GraphQL query (newest first, cursor on `(created_at, id)`, default 20, maximum 100) and on the web app's new `/audit-log` page, which the sidebar shows only to them. A member gets `admin role required`.

  `@repo/auth` adds `@repo/auth/audit` (`recordAuditEvent`, `runWithAuditRequest`) and `@repo/auth/audit.definition` (the closed action union and its metadata shapes). `@repo/db` migration `0016` adds the `audit_events` table with no foreign keys, so an event outlives its actor and its Organization. Retention is not set; #710 owns it.

- 5752644: Owners and admins now run their Organization from the web app's Members page: invite by email and role, revoke pending Invitations, change roles between admin and member, remove members, rename the Organization, and (owners) transfer ownership or delete it. Any member can leave. An invited person opens `/invitations/:invitationId`, signs in or signs up, comes back to the same page, and accepts or declines. `/auth?redirect=<path>` accepts only same-origin relative paths.

  `@repo/auth` breaking changes: the organization routes that act on one Organization (`invite-member`, `remove-member`, `update-member-role`, `update`, `leave`, `delete`) take the Active Organization from the session and refuse a different `organizationId` with `ACTIVE_ORGANIZATION_MISMATCH`. `invite-member` and `update-member-role` refuse the `owner` role; ownership moves only through the new `POST /organization/transfer-ownership`, which runs in one transaction and moves `organizations.user_id`. A Personal Organization cannot be deleted, left, or transferred. `AuthClientOrganization` has a required `personal` field. The invitation email carries the accept URL built from the new `WEB_APP_URL` (default `http://localhost:3000`), which the API validates at startup.

  `@repo/db` migration `0013` adds `organizations.personal`, marks existing personal organizations, and adds an `organization_storage_purges` queue that a trigger fills on every Organization delete. The API storage sweep deletes a deleted Organization's private `<organizationId>/` objects and its logo, and retries a failed delete on the next run.

- 6839bae: Web users sign in with passkeys and with magic links (#712).

  `@repo/auth` enables the official `@better-auth/passkey` add-on (pinned at `1.7.12` in the catalog, next to `better-auth`) and better-auth's `magicLink` plugin. The passkey relying party id is the host of `WEB_APP_URL` and the expected origin is its origin. Only an account with a verified email address can add a passkey, and an email-code or magic-link sign-in that verifies an account deletes the passkeys added before, so a squatter on an unverified address keeps no way back in. A passkey name has at most 64 characters, and adding a passkey emails a security alert. A magic link is for an existing account only (`disableSignUp`), stores its token hashed, expires in 10 minutes, and works once; `/sign-in/magic-link` is captcha-protected. The server emails the link only when an account exists, after the response, so the answer and its timing are the same for every address. Neither sign-in is challenged by two-factor, matching the email-code rule (ADR 0015). Adding and removing a passkey record the `passkey_added` and `passkey_removed` Audit Events, and the GraphQL `AuditAction` enum gains both.

  `advanced.database.generateId` is now better-auth's `"uuid"` strategy, so the database generates row ids. The previous custom function made better-auth encode the cleanup lock of an email-code or magic-link sign-in into an unverified account as base64url, which the uuid column rejected, so that sign-in failed. That sign-in now works and runs better-auth's cleanup: it removes the account's password and older sessions. When it removes a password, the address gets a translated `passwordRemoved` email that says so and points to "Forgot password?".

  The auth transport adds `sendMagicLink`, `signInWithPasskey`, `addPasskey`, `listPasskeys`, and `deletePasskey`, and registers the magic-link and passkey client plugins. `@repo/email` adds the `magicLink`, `passkeyAdded`, and `passwordRemoved` templates.

  Migration `0023` adds the `passkeys` table.

  The web Security page lists, adds (verified accounts only), and deletes the user's passkeys, with a confirmation step before a delete. The sign-in page offers "Sign in with a passkey" and "Email me a sign-in link"; a used or expired link returns to it with a clear error. The desktop app hides passkeys: it serves the web build from its Tauri origin, which never matches the relying party.

- 4e3873d: Authorization checks named Permissions instead of role ranks. `@repo/auth/permissions` defines one catalog with better-auth's `createAccessControl`: the organization plugin's statements plus `todo`, `note`, `attachment`, `logo`, and `audit`, with `organization:transfer` and `invitation:read` added. The owner, admin, and member roles grant exactly what they granted before, and the organization plugin receives the catalog through its `ac` and `roles` options.

  The Authenticated Organization Scope now carries `membership.permissions`, read with the membership on every request. `hasOrganizationPermission(scope, permission)` and `requireOrganizationPermission(scope, permission)` in `@repo/auth/scope` answer every server check; a refused check throws `permission required: <permission>` (it was `admin role required`). Todo, Note, and Attachment writes, the organization logo, the audit log, and the invitation list each check their Permission. The new `organizationPermissions` GraphQL query returns the caller's Permissions, and the web app shows controls from them.

  Owners create, list, update, and delete Custom Roles for the Active Organization through better-auth dynamic access control (at most 25 per Organization). A Custom Role cannot grant an owner-only Permission, reuse a built-in role name, take a name outside 2 to 32 lowercase letters, digits, or hyphens, or be renamed. An invite or a role change cannot give the owner role, even inside a comma-separated role, or a role with a Permission the caller does not hold. A role change or a removal is refused when the member holds a Permission the caller does not, and a Custom Role cannot be deleted while a pending Invitation gives it. Custom Role changes write `role_created` and `role_updated` Audit Events with the granted Permissions, and `role_deleted`. `generateTodos` checks `todo:create` before any model call, the invitation email, the role-changed email, and the role-changed notification name a Custom Role, and onboarding offers the invite step from `invitation:create`. The members page gains a Custom Roles section for owners, and invites and role changes offer Custom Roles.

  Migration `0020` adds the `organization_roles` table and widens `members.role` and `invitations.role` to `text`, because a member can hold several comma-separated roles.

  Breaking for `@repo/auth` consumers: `hasRoleAtLeast`, `ORGANIZATION_ROLE_HIERARCHY`, and `AssignableOrganizationRole` are removed, and `AuthenticatedOrganizationMembership` and `OrganizationMembershipProof` require `permissions`. Build a test scope's permissions with `resolveRolePermissions(role, [])`.

- a2b6d40: Feature flags now resolve at runtime in three layers: the registry default, then the `FEATURE_FLAG_<KEY>` environment variable for the whole API process, then the Active Organization's override for a flag that allows one. `@repo/feature-flags` adds the typed `FEATURE_FLAG_REGISTRY` (key, default, `organizationOverridable`), `resolveFlags`, `parseFeatureFlagEnvironment`, and `featureFlagsFromValues`, and `unknownFeatureFlagVariables`; `resolveFeatureFlags()` without arguments still returns the defaults, so mobile is unchanged. `organizations_visible` keeps default `true` and does not allow an Organization override. An invalid `FEATURE_FLAG_*` value fails API startup, and a `FEATURE_FLAG_*` variable that names no flag logs a warning at boot.

  The API resolves flags once per request into `ctx.featureFlags`. The new `featureFlags` GraphQL query returns them for the signed-in session, with the Active Organization's overrides when it has one; members with the new `featureFlag:update` Permission (owner and admin by default; a Custom Role may grant it) set and clear an override with `setFeatureFlagOverride` and `clearFeatureFlagOverride` (anyone else gets `permission required: featureFlag:update`), and each change records a `feature_flag_override_changed` Audit Event (a repeat of the current value records none). `@repo/db` migration `0021` adds the `feature_flag_overrides` table. The web `OrganizationProvider` reads the query, keyed by the Active Organization. Until it succeeds, the provider reports loading, keeps organization UI hidden, and does not restore the remembered Organization.

### Patch Changes

- a426b9a: A deleted Organization's storage purge that keeps failing (for example a denied logo delete) no longer blocks later Organizations. Migration `0014` adds `organization_storage_purges.attempted_at`; the storage sweep takes never-tried rows first and moves a failed row behind them.
- Updated dependencies [729d942]
- Updated dependencies [5752644]
- Updated dependencies [1e5e82d]
- Updated dependencies [a54d7ff]
- Updated dependencies [fc6f746]
- Updated dependencies [d1fa587]
- Updated dependencies [8be54b9]
- Updated dependencies [a9cc2b2]
- Updated dependencies [5752644]
- Updated dependencies [a426b9a]
- Updated dependencies [6839bae]
- Updated dependencies [4e3873d]
- Updated dependencies [a2b6d40]
  - @repo/auth@5.0.0
  - @repo/db@2.0.0
  - @repo/email@1.3.0
  - @repo/translation@1.11.0
  - @repo/jobs@1.0.0
  - @repo/logger@1.2.1
  - @repo/feature-flags@1.2.0
  - @repo/storage@1.5.0

## 1.14.0

### Minor Changes

- 2e2bd97: `/graphql` now requires the `x-graphql-yoga-csrf` header on GET requests and on POSTs without a content type or with `text/plain`, `application/x-www-form-urlencoded`, or `multipart/form-data`; those requests get 403 without it. JSON POSTs are unaffected, and allowlisted origins may send the header through CORS. The web, desktop, and mobile GraphQL clients send `x-graphql-yoga-csrf: 1`; other GraphQL clients that use GET must send it too. Every API response, including `/api/auth/*`, `/health`, and 429s, carries `X-Content-Type-Options: nosniff`. The web image sends `Content-Security-Policy`, `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), and `Permissions-Policy` on every response, including `/assets/` and `index.html`. Set `CSP_STORAGE_ORIGINS`, `CSP_PUBLIC_ASSET_ORIGINS`, and, for a cross-origin API, `CSP_API_ORIGINS` on the web container when they differ from the same-origin defaults; otherwise the browser blocks uploads and storage images.
- 32c958f: Add a Postgres background job runner (ADR 0018). The new `@repo/jobs` package wraps pg-boss on the existing `DATABASE_URL`, with typed job definitions, retries with backoff, and a bounded `stop()`. Its tables live in the `pgboss` schema, which pg-boss creates on start.

  The API starts the job queue after migrations and after it listens, runs the job handlers by default, and stops them before the database pool closes on shutdown. Set the new `JOBS_RUNNER_ENABLED=false` to keep the API enqueue-only and run `node apps/api/dist/worker.js` from the same image as a separate worker.

  `@repo/auth` no longer sends email inline. Every auth email (password reset, email verification, invitation, two-factor code, and email one-time codes) is enqueued as an `email.send` job and delivered by the runner, which retries a failed send. A process that imports `@repo/auth/instance` must now call `jobQueue.start()` from `@repo/jobs/client`, and run the runner or a worker, or auth emails are not delivered.

### Patch Changes

- Updated dependencies [32c958f]
  - @repo/jobs@0.1.0
  - @repo/auth@4.0.0

## 1.13.0

### Minor Changes

- 02548ca: Purge expired auth rows on an interval: expired sessions and verification rows, and Invitations more than 30 days past expiry. One API replica runs it at a time through a Postgres advisory lock. It is on by default; `HOUSEKEEPING_ENABLED=false` turns it off and `HOUSEKEEPING_INTERVAL_MS` changes the hourly interval.
- 314c3dd: The API now shuts down gracefully on `SIGTERM` or `SIGINT`. It stops accepting connections, lets in-flight requests finish, closes GraphQL WebSocket clients with code 1001, stops the Attachment sweep, and closes the database pool, then exits with code 0. A new optional `API_SHUTDOWN_TIMEOUT_MS` (default 8000) bounds the drain; when it expires, the API force-closes the remaining connections and exits with code 1.
- 46d5bd6: Every HTTP request to the API, including `/api/auth/*`, `/health`, and 429 responses, now gets a request id. The API reuses an incoming `x-request-id` of 1 to 128 characters from `[A-Za-z0-9._-]` and otherwise generates a UUID. The id comes back in the `x-request-id` response header, which CORS exposes to browser clients, and it is bound to every log line for the request. One `request completed` line per request records `method`, `path`, `status`, `durationMs`, and `requestId`; `/health` completion lines log at `debug`. Each GraphQL WebSocket connection logs a `connectionId` on connect and disconnect. The Yoga `request started` line is removed. `createLogger` now redacts `authorization`, `cookie`, and `set-cookie` header values as `[redacted]`.

### Patch Changes

- Updated dependencies [07b9031]
- Updated dependencies [12ad7c5]
- Updated dependencies [46d5bd6]
- Updated dependencies [2ddc1a9]
  - @repo/db@1.8.1
  - @repo/translation@1.10.0
  - @repo/logger@1.2.0
  - @repo/auth@3.0.3

## 1.12.1

### Patch Changes

- Updated dependencies [591495f]
  - @repo/auth@3.0.2

## 1.12.0

### Minor Changes

- 6d93644: Uploaded image Attachments are re-encoded without metadata (EXIF, GPS) and get a WebP thumbnail (`FileInfo.thumbnailUrl`), shown in the web attachment list. Users can set an avatar and organization admins can set a logo: both are Public Assets, re-encoded as square WebP and served from a separate public bucket through a CDN (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`). The storage sweep also clears unconfirmed Public Asset uploads.

### Patch Changes

- Updated dependencies [6d93644]
  - @repo/storage@1.5.0

## 1.11.0

### Minor Changes

- 0d5959c: The API now sweeps storage objects of deleted and abandoned Attachments on an interval (`STORAGE_SWEEP_INTERVAL_MS`, default 15 minutes; `STORAGE_SWEEP_ENABLED=false` turns it off). A Postgres advisory lock keeps it to one replica, and a new `files.purged_at` column records each removed object. A failed delete is retried on the next run, and the sweep never deletes a key outside the row's organization prefix.

### Patch Changes

- 9a5f4f3: Harden Attachment uploads. The presigned PUT signs `Content-Length` and no longer carries a checksum of an empty body, so S3 accepts the upload and rejects any other size. Upload and download URLs get separate, shorter expiries (`S3_UPLOAD_URL_EXPIRY`, `S3_DOWNLOAD_URL_EXPIRY`). Confirm checks the object's leading bytes against its MIME type and deletes a rejected object. A file name whose extension does not match its MIME type is rejected, and non-image downloads carry `Content-Disposition: attachment`.
- Updated dependencies [9a5f4f3]
- Updated dependencies [0d5959c]
  - @repo/storage@1.4.0
  - @repo/db@1.8.0
  - @repo/auth@3.0.1

## 1.10.0

### Minor Changes

- 9cbf84c: Type the Attachment entity type as the `AttachmentEntityType` GraphQL enum (`general`, `todo`) and a `files.entity_type` pgEnum. Migration `0010` maps any other stored value to `general` first; the API now rejects unknown entity types at the GraphQL boundary.
- a1c0431: Adds two-factor sign-in (authenticator app, email code, backup codes), email one-time-code sign-in and password reset, optional Cloudflare Turnstile captcha, and a Have I Been Pwned check on new passwords; caches sessions in a signed cookie for five minutes and adds the better-auth performance indexes (ADR 0015).

### Patch Changes

- 3c0f36e: One Attachment module (`features/storage/attachment.module.ts`, `ctx.attachments`) owns an Attachment's row and its stored object together: request, confirm, delete, and the Todo cleanup the Todo module uses. The object store is a port with an S3 adapter and an in-memory adapter, and every object call uses the bucket and key its row records. The storage lifecycle, runtime, and attachment lifecycle modules are gone.
- 56c7d80: Deleting a Todo now removes its Attachment objects from storage in the background, with each delete bounded by a timeout, so a slow object store no longer delays the delete or its event. An upload linked to a Todo outside the Active Organization is rejected, and file listing clamps a negative offset. `deleteObject` accepts an optional `abortSignal`.
- 98e5dcc: One Note module (`features/notes/notes.module.ts`, `ctx.notes`) owns Note reads, writes, input normalization, and `note:*` events. The Note resolvers and the assistant tools go through it; `ctx.workflows` and the Note workflow adapter are gone, and the assistant tools no longer take a scope.
- 68fc597: `@repo/auth/scope` now has one producer of `AuthenticatedOrganizationScope`: `resolveOrganizationScope`, which proves Organization Membership and returns the optional scope plus `requireOrganizationScope`. `membership` is required, and the unchecked `requireAuthenticatedOrganizationScope` and the old `resolveAuthenticatedOrganizationScope` exports are removed.
- 7b8bd4d: The API builds its organization-filtered subscription resolvers from one map of fields to `PubSubEventMap` events. The web uses the generated subscription documents through `useLiveTodos` and `useLiveNotes`, so the hand-written subscription strings are gone, and the Todo subscriptions select only `id`.
- 67f4516: Add `@repo/db/testing` (`createTestDatabase()`: PGlite with every migration applied) and the `Database` type. The API builds one scoped data-access module per request (`context.data.ts`) that alone writes the organization predicate, stamps inserts, clamps pagination, and escapes search phrases; feature adapters no longer import the `db` singleton.
- 272259f: One Todo module (`features/todos/todos.module.ts`, `ctx.todos`) owns Todo reads, writes, input normalization, `todo:*` events, and Attachment cleanup on delete. AI generation, `addTodoToNote`, the assistant tools, the batch loader, and the Attachment target check all go through it; `TodoWorkflowAdapter` and the second create path are gone.
- Updated dependencies [9cbf84c]
- Updated dependencies [56c7d80]
- Updated dependencies [a1c0431]
- Updated dependencies [519408c]
- Updated dependencies [68fc597]
- Updated dependencies [67f4516]
  - @repo/db@1.7.0
  - @repo/storage@1.3.0
  - @repo/auth@3.0.0
  - @repo/translation@1.9.1

## 1.9.4

### Patch Changes

- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
- Updated dependencies [b7011e2]
  - @repo/translation@1.9.0
  - @repo/auth@2.0.0
  - @repo/db@1.6.3
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/storage@1.2.2

## 1.9.3

### Patch Changes

- Updated dependencies [4f69756]
  - @repo/translation@1.8.0

## 1.9.2

### Patch Changes

- Updated dependencies [6a30ea3]
- Updated dependencies [850ba14]
  - @repo/translation@1.7.0
  - @repo/auth@2.0.0

## 1.9.1

### Patch Changes

- Updated dependencies [5786f03]
- Updated dependencies [078f259]
- Updated dependencies [078f259]
  - @repo/translation@1.6.0

## 1.9.0

### Minor Changes

- 8e9e541: Add a committed assistant live-eval summary ledger with `eval:assistant record`, which refuses a run whose pass rate falls below the previous run for the same provider, model and dataset. The golden-set coverage floor now follows the real tool set, and a new `list-then-rename-note` case expects `updateNote`.

### Patch Changes

- 3d049e2: Stop parsing the unused `ORGANIZATIONS_VISIBLE` environment variable. The flag value comes only from `@repo/feature-flags`.
- Updated dependencies [1ce6a5f]
- Updated dependencies [25e0a60]
  - @repo/auth@1.6.0
  - @repo/db@1.6.3
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/storage@1.2.2
  - @repo/translation@1.5.0

## 1.8.2

### Patch Changes

- Updated dependencies [cb7174c]
  - @repo/translation@1.5.0

## 1.8.1

### Patch Changes

- Updated dependencies [b39e2d4]
  - @repo/translation@1.4.1
  - @repo/auth@1.5.2
  - @repo/db@1.6.2
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/storage@1.2.2

## 1.8.0

### Minor Changes

- 6907d18: Refresh Notes with a responsive list and editor, full Organization-scoped title/body search, pagination, explicit saving, protected per-note drafts, and clearer checklist feedback. Preserve newer edits during saves and prevent accidental draft loss during navigation and Organization changes.
- db46fcf: Refresh Todos with inline creation, searchable status views, pagination, protected drafts, and clearer action and attachment feedback. Keep text edits separate from completion changes across web and mobile, and preserve Organization scoping.

### Patch Changes

- a948c89: Add manually invoked assistant evaluations with isolated synthetic data, stored-state scoring and human review. Emit sanitized terminal telemetry for assistant and Todo generation runs, including failure and cancellation.
- Updated dependencies [99a5fc9]
- Updated dependencies [28ab725]
- Updated dependencies [6907d18]
- Updated dependencies [db46fcf]
- Updated dependencies [4143c11]
  - @repo/translation@1.4.0

## 1.7.1

### Patch Changes

- 31804e3: Route assistant and note write paths through the todo and note workflows. Deleting a todo through the AI assistant skipped attachment cleanup, so the file rows were orphaned at `status = 'uploaded'` and their storage objects were never reclaimed — the equivalent GraphQL mutation did not have this problem. Creating or updating a todo through the assistant, and adding a todo to a note through the `addTodoToNote` mutation, also skipped title and description normalization, so a whitespace-only title could be stored where the mutation rejects it.

  The workflows now live on the request context, so every feature that writes a todo shares one set of guards instead of each wiring its own.

## 1.7.0

### Minor Changes

- 6df23ad: Validate the AI provider and model environment variables. `AI_ASSISTANT_PROVIDER` and `AI_ASSISTANT_MODEL` were read by the assistant runtime but declared nowhere, and `AI_TODO_PROVIDER` accepted any string — so a misspelled provider silently fell back to OpenAI. Both provider variables are now an enum that is trimmed and lowercased before matching, so a typo fails at startup with the variable named. Blank still means unset, which keeps a fresh clone bootable.

  Breaking for any deployment currently setting a provider value that is not exactly `openai` or `deepseek`: the API now exits at startup instead of quietly using OpenAI.

### Patch Changes

- 6df23ad: Record AI failures and model-call usage. Both AI workflows previously ended in a bare `catch` that returned a degraded status with no log and no trace, so a provider outage, an expired key and a bug in our own persistence were indistinguishable. The degraded response is unchanged; the reason is now logged and sent to the error reporter.

  Each model call also emits one structured line with provider, model, input/output/total tokens, duration, and — for the assistant — step and tool-call counts. Metadata only: no prompt, message, reply, tool payload or cost figure. Errors are logged under an `error` key rather than `err`, because pino's default serializer would otherwise copy the AI SDK's request body, which holds the prompt and the whole conversation, onto the record.

- abb5b14: Prove organization scoping by executing GraphQL operations over real HTTP against an in-process Postgres (PGlite), covering the list query, the point read, a cross-organization update, the batched todos DataLoader, the membership gate, and the unauthenticated path.

## 1.6.4

### Patch Changes

- Updated dependencies [cd623ee]
  - @repo/translation@1.3.2

## 1.6.3

### Patch Changes

- Updated dependencies [67abc54]
  - @repo/storage@1.2.2

## 1.6.2

### Patch Changes

- Updated dependencies [ceef03e]
- Updated dependencies [9f617ba]
  - @repo/auth@1.5.2
  - @repo/storage@1.2.1
  - @repo/db@1.6.2
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/translation@1.3.1

## 1.6.1

### Patch Changes

- 5aa8a1d: Clear fixable Trivy CRITICAL findings in the API Docker image via workspace overrides (shell-quote, tar, esbuild), catalog bumps (vitest, drizzle-orm), and drop the unused base-image npm (nested tar) from the API runner stage.
- Updated dependencies [5aa8a1d]
  - @repo/auth@1.5.1
  - @repo/db@1.6.1

## 1.6.0

### Minor Changes

- fdce5d8: Template audit follow-through fixes:
  - `@repo/api`: batch `Todo.attachments` and `Note.todos` through per-request DataLoaders, surface attachment lookup failures instead of returning `[]`, and reject `createTodo` inputs whose `noteId` belongs to another organization.
  - `@repo/db`: add organization-scoped indexes on `todos`, `notes`, and `files` (migration `0008`).
  - `@repo/config`: enforce `@typescript-eslint/no-explicit-any` as an error.
  - `@repo/translation`: locale-consistency test now discovers namespaces from disk, covering `assistant`, `notes`, and `storage`.

### Patch Changes

- 44b7eaa: Assistant review fixes:
  - `@repo/api`: scope assistant conversation lookups to the owning user so same-organization members can no longer read or continue another user's conversation, send the latest window of messages (instead of the oldest 50) to the model, warn at startup when `API_CORS_ORIGINS` is unset in production, and drop the unused `noteId` field from `CreateTodoInput`.
  - `@repo/db`: add indexes for assistant conversations and messages (migration `0009`).

- 449e3cc: Fail closed when `API_CORS_ORIGINS` is missing or empty in production so credentialed CORS cannot reflect any origin.
- 4c45e37: Emit flat package dist for Docker: build tsconfigs clear monorepo path mappings, pin rootDir, and exclude tests so main/exports match runtime layout.
- e97c8fb: Add GraphQL query complexity limits and disable introspection by default in production.
- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 6b03bd4: Add type-aware ESLint via the TypeScript project service: `no-floating-promises`, `no-misused-promises`, and `await-thenable` as errors across the repo (excluding files not covered by any tsconfig). Fix the 14 real violations it surfaced — `void`-wrapping async JSX event handlers and fire-and-forget lifecycle/teardown calls, and extracting the API server's async request handler — with no behavior change. `require-await` is intentionally not enabled (noise on async functions without `await`, e.g. resolvers).
- 8be5914: Enable mobile social login with @better-auth/expo deep-link OAuth (server expo plugin, client expoClient, env-gated buttons).
- 1114f7e: Add optional error reporter seam (disabled by default) and wire unhandled API errors through it.
- b64b17a: Default MIME allowlist for uploads (no SVG), and re-validate size/type on confirm using object HEAD metadata.
- 21b3002: Make the Turbo dependency graph honest and stop the cache from invalidating itself.

  `@repo/config` was consumed by every workspace through relative `tsconfig` extends and the root ESLint/Prettier configs, but was declared as a dependency by nobody. Three workarounds had grown around that missing edge: a `packages/config/**` entry in `globalDependencies`, a hand-written `COPY --from=pruner /app/packages/config/` in both Dockerfiles because `turbo prune` correctly excluded it, and a hardcoded `SHARED_BUILD_WORKSPACE_DIRS` in `.ai/release.util.ts`. Every workspace now declares `@repo/config`, and all three workarounds are gone — `turbo prune` includes the presets on its own, and `release-apps` derives affected apps from the graph.

  Cache inputs are now scoped to what each task actually reads. Global hashed files drop from 27 to 2:
  - `pnpm-lock.yaml` left `globalDependencies` — Turborepo already hashes each package's resolved external dependencies, so listing the whole lockfile invalidated every task in every package on any dependency bump.
  - `eslint.config.mjs` and `.prettierrc*` moved from `globalDependencies` to per-task `inputs` on `lint` and `format:check` via `$TURBO_ROOT$`, so a lint-config edit no longer invalidates `build` and `test`.
  - Globbing `packages/config/**` had pulled gitignored `.turbo/*.log` files, `CHANGELOG.md`, and the package's own tests into the global hash. A new `packages/config/turbo.json` narrows its `build` inputs to the preset files.
  - `build` now excludes `CHANGELOG.md`, so `changeset version` no longer busts every build cache.
  - `CI` moved from `globalEnv` to `globalPassThroughEnv`. It is unset locally and `true` in Actions, so hashing it meant a CI cache entry could never be restored on a developer machine, or the reverse.

  Three alignment tests guard the fix: every workspace must declare `@repo/config`, `globalDependencies` must not glob a package or list the lockfile, and neither Dockerfile may hand-copy `packages/config`.

  `test` keeps its `^build` dependency. Wiping every `dist` and running tests without building fails `@repo/email#test`, because only `apps/api`, `apps/mobile`, `packages/auth`, and `packages/mobile-ui` alias `@repo/*` to source in their vitest config; the rest resolve siblings through package exports. That is now recorded in the task description.

- 6fdb904: Upgrade Vercel AI SDK from v6 to v7 and migrate `system`/`stepCountIs` call sites.
- Updated dependencies [22a7c4d]
- Updated dependencies [44b7eaa]
- Updated dependencies [8d04ade]
- Updated dependencies [4c45e37]
- Updated dependencies [7bdc15c]
- Updated dependencies [8be5914]
- Updated dependencies [1114f7e]
- Updated dependencies [81919a2]
- Updated dependencies [b64b17a]
- Updated dependencies [fdce5d8]
- Updated dependencies [79fa89e]
- Updated dependencies [21b3002]
  - @repo/auth@1.5.0
  - @repo/db@1.6.0
  - @repo/feature-flags@1.1.1
  - @repo/logger@1.1.0
  - @repo/storage@1.2.0
  - @repo/translation@1.3.1

## 1.5.0

### Minor Changes

- 87e6d0b: Add a Notes feature and multi-chat assistant. Notes have a title, a body, and a
  checklist of todos (todos gain a nullable `note_id`, detached on note delete). Notes are
  managed at `/notes` + `/notes/:id` and can also be created/updated by the AI assistant
  via new tools (`createNote` with an inline checklist, `listNotes`, `updateNote`,
  `addTodoToNote`); note changes stream live over `note:*` subscriptions. The assistant page
  becomes multi-chat: conversations are listed, resumable, and deletable, message history
  loads on open, and each assistant turn surfaces clickable links to the notes it created.

### Patch Changes

- Updated dependencies [87e6d0b]
  - @repo/db@1.5.0
  - @repo/translation@1.3.0
  - @repo/auth@1.4.2

## 1.4.0

### Minor Changes

- f136b60: Add an agentic AI assistant example that extends the todo generator. A new `/assistant`
  chat runs a multi-step tool-calling loop (Vercel AI SDK `streamText` + `stepCountIs`) that
  can create, list, complete, update, and delete todos through org-scoped tools. Replies stream
  token-by-token over a new `assistantMessageDelta` subscription, and the assistant page shows a
  live todo list driven by the existing `todo:*` events. Conversations and messages are persisted
  in new `assistant_conversations` and `assistant_messages` tables. The assistant provider config
  falls back to the existing `AI_TODO_PROVIDER`/`AI_TODO_MODEL` (OpenAI/DeepSeek) settings.

### Patch Changes

- Updated dependencies [f136b60]
  - @repo/db@1.4.0
  - @repo/translation@1.2.0
  - @repo/auth@1.4.1

## 1.3.0

### Minor Changes

- 68ebc61: Serve /api/auth/\* through better-auth's node handler; ServerAuth slims to the session/read facade; signup invariants move to better-auth database hooks. users.password_hash becomes nullable so better-auth-created users need no legacy hash.

### Patch Changes

- 4057465: Env-gated GitHub and Google social login: each provider activates only when both its client id and secret are set
- Updated dependencies [c046f32]
- Updated dependencies [68ebc61]
- Updated dependencies [b2b0a3e]
- Updated dependencies [4057465]
- Updated dependencies [c1d66c1]
- Updated dependencies [9cc4adf]
  - @repo/auth@1.4.0
  - @repo/db@1.3.0

## 1.2.0

### Minor Changes

- f884c6b: Add optional email verification on signup (AUTH_REQUIRE_EMAIL_VERIFICATION, soft mode): users.email_verified column + migration, hashed verification tokens with atomic claim, emailVerified exposed on the session user payload, and /api/auth/verify-email plus session-authenticated /api/auth/resend-email-verification
- 60cad98: Validate all API environment variables with Zod at startup; fail fast with a single error naming every missing or invalid variable
- 7fba80f: Add HTTP liveness (/health) and readiness (/ready, database connectivity) endpoints
- d03004e: Add organization invitation lifecycle: create/list/accept/revoke with role rules, expiry, and email notification. New REST routes under /api/auth/organization/invitation/\* and an invitations GraphQL query. Membership rows are now enforced unique per (organization, user) via a new unique index and migration, and invitation acceptance flips status and inserts the membership atomically. Note: the migration fails if duplicate (organization, user) member rows already exist — dedupe manually before migrating. Migration 0001 also backfills the `files` table and `file_status` enum, which previously existed only in schema source; databases provisioned via `db:push` from an earlier main already have them and must skip those statements when adopting `db:migrate`.
- c72eb56: Add password reset flow: request-reset (tokenized, no account enumeration) and reset (rehash + session invalidation) via /api/auth/request-password-reset and /api/auth/reset-password
- 5d8d4a1: Add in-memory fixed-window rate limiting for `/api/auth/*` and `/graphql` (`API_RATE_LIMIT_*` env vars; disabled in tests; Redis-ready check() contract). Also: constant-shape login timing for unknown emails, best-effort rehash-on-login, bounded /ready DB check, and Yoga's built-in health endpoint moved off /health.

### Patch Changes

- 881822c: Add HEALTHCHECK directives to Dockerfile.api (Node fetch against /health) and Dockerfile.web (wget against nginx)
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [c72eb56]
- Updated dependencies [5d8d4a1]
- Updated dependencies [3733f8d]
  - @repo/db@1.2.0
  - @repo/auth@1.3.0

## 1.1.11

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.

## 1.1.10

### Patch Changes

- 89c319b: Add a LAN mobile dev workflow for physical device testing against a laptop-hosted API.

## 1.1.9

### Patch Changes

- 5d3ac31: Deepen API Todo mutation workflow orchestration while preserving GraphQL behavior.

## 1.1.8

### Patch Changes

- 845fa00: Move API storage runtime composition behind a dedicated Module while preserving storage lifecycle behavior.

## 1.1.7

### Patch Changes

- 69f4711: Deepen API auth transport, storage lifecycle, shared upload/auth transitions, explicit query runtime registration, and preference persistence modules.
- Updated dependencies [69f4711]
  - @repo/storage@1.1.2

## 1.1.6

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.
- Updated dependencies [1d159d2]
  - @repo/auth@1.2.2
  - @repo/translation@1.1.1

## 1.1.5

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.
- Updated dependencies [af949dd]
  - @repo/auth@1.2.1
  - @repo/storage@1.1.1

## 1.1.4

### Patch Changes

- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.
- Updated dependencies [7b286b2]
- Updated dependencies [7af7edb]
  - @repo/auth@1.2.0
  - @repo/storage@1.1.0

## 1.1.3

### Patch Changes

- 29a0d96: Deepen Authenticated Organization Scope and move Organization membership reads into the auth package.
- Updated dependencies [29a0d96]
  - @repo/auth@1.1.2

## 1.1.2

### Patch Changes

- 17d103e: Deepen API organization-scoped access around an authenticated organization scope.

## 1.1.1

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/auth@1.1.1
  - @repo/db@1.1.1

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/feature-flags@1.1.0
  - @repo/translation@1.1.0
  - @repo/auth@1.1.0
  - @repo/db@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/translation@1.0.0
  - @repo/auth@1.0.0
  - @repo/db@1.0.0
