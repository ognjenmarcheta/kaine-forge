# @repo/db

## 2.0.0

### Major Changes

- 729d942: A signed-in user now manages their own account on the web app's new `/account` page, opened from the sidebar user menu: avatar and display name, email address, password, signed-in sessions, linked sign-in methods, and account deletion. The avatar uploader moves there from `/security`, which keeps two-step verification only.

  `@repo/auth` turns on better-auth `user.changeEmail` (`updateEmailWithoutVerification: false`, so the email changes only after the new address is verified; a verified user's old address approves the change first) and `user.deleteUser` with an emailed confirmation link to `<WEB_APP_URL>/account/delete?token=…`. Deletion is refused with `SOLE_OWNER_OF_SHARED_ORGANIZATION` or `PERSONAL_ORGANIZATION_HAS_MEMBERS`, and the error body carries `organizationName`. In one locked transaction before the user row goes, the Organizations the user is alone in are deleted (their storage is queued for the sweep) and a shared, non-personal Organization's `user_id` moves to another owner. New `GET /account/social-providers` lists the providers the server configured. `AuthTransport` gains `updateProfile`, `changePassword`, `changeEmail`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `listAccounts`, `listSocialProviders`, `linkSocialAccount`, `unlinkAccount`, `requestAccountDeletion` and `confirmAccountDeletion`; `AuthRequestError` gains `organizationName`. Breaking: `/sign-up/email` and `/update-user` refuse `image`, and `/organization/create` and `/organization/update` refuse `logo`, with `PUBLIC_ASSET_URL_READ_ONLY`. Only the API's Public Asset upload writes those URLs, because a client-chosen URL could name another owner's file.

  `@repo/db` breaking change: migration `0017` makes `files.uploaded_by` and `organizations.user_id` nullable with `ON DELETE SET NULL`, so `File.uploadedBy` and `Organization.userId` are `string | null`. An Attachment stays with its Organization after its uploader deletes their account, and an Organization that reaches a user while their account is being deleted survives with its members. The migration also adds a `public_asset_purges` queue (user id and image URL) that a trigger fills for every deleted user.

  `@repo/api`: new avatars and logos are published under `avatars/<userId>/` and `organization-logos/<organizationId>/`. Replacing a Public Asset, purging a deleted Organization's logo, and the new sweep of deleted users' avatars delete an object only when its key belongs to that owner. A legacy key without an owner is left in the bucket.

  `@repo/email` adds the `emailChangeApproval` and `accountDeletion` templates (en, sr, de) for these emails.

  `@repo/ui`: `NavUser` takes an optional `accountItem` menu entry above log out.

### Minor Changes

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

- fc6f746: After sign-up, the web app (and the desktop app, which loads the same bundle) shows a first-run onboarding once at `/onboarding`: name the Personal Organization or create a new Organization with that name, then invite teammates with the Members page invite form. Every step can be skipped; skip and finish both end onboarding and open `/dashboard`, and a user who finished it is sent from `/onboarding` to `/dashboard`. A user who signs up from an Invitation link reaches the Invitation page first; after accepting, onboarding offers only the steps that still apply, and ends at once for a member. Mobile sign-ups are not redirected.

  `@repo/auth`: new `POST /onboarding/complete` marks onboarding complete for the session user and refreshes the cached session cookie. `user.additionalFields.onboardingCompletedAt` (`input: false`) puts the completion time on the session, and `/update-user` refuses it. `AuthSessionUser` gains an optional `onboardingCompleted` that the client transport sets, and `AuthTransport` gains `completeOnboarding()`. Breaking: `/organization/create` and `/organization/update` refuse a name over 64 characters (`AUTH_DEFINITIONS.ORGANIZATION_NAME_MAX_LENGTH`) with `ORGANIZATION_NAME_TOO_LONG`, because Organization names appear in invitation emails.

  `@repo/db`: migration `0018` adds the nullable `users.onboarding_completed_at` column and backfills it for every existing user, so existing accounts never see onboarding. The seed user is created with it set.

- d1fa587: Transactional emails now have an HTML part and a plain-text part, rendered with React Email (`@react-email/render`) from typed templates in the recipient's language: password reset, email verification, invitation, two-factor code, the four email one-time codes, a new welcome email, and new security alerts for a password change (also after a reset), an email change (sent to the previous address), and two-factor turning on.

  `@repo/email`: `EmailMessage` gains an optional `html` (absent only for a text-only message). The Resend adapter sends `html` and `text`; the console adapter logs recipient, subject, and text only. `renderEmail(template, locale)` renders `{ subject, html, text }` with a fixed locale and falls back to `DEFAULT_LANGUAGE`; it never changes the shared i18next language. User-supplied names are escaped in the HTML part.

  `@repo/jobs`: the `email.send` payload carries `html`. It stays optional for one release, so a job queued by the previous release still goes out as text only. Every auth email still goes through this job with retries, and auth responses do not wait for rendering or enqueueing.

  `@repo/db` migration `0015` adds a nullable `users.locale`. `@repo/auth` exposes it as a user field that accepts only `en`, `sr`, or `de`, and `AuthTransport.updateEmailLanguage` writes it. Web sign-up sends the UI language, and the web language switch stores a change for the signed-in user. An invitation uses the inviter's stored language, and a change-email code uses the requesting user's language. The welcome email carries no user-supplied text, and sign-up and `/update-user` refuse a name longer than 64 characters (`NAME_TOO_LONG`).

  `@repo/translation` adds the `email` namespace in `en`, `sr`, and `de`. `@repo/config` compiles `.tsx` in Node workspaces (`jsx: react-jsx`).

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
- Updated dependencies [1e5e82d]
  - @repo/logger@1.2.1

## 1.8.1

### Patch Changes

- 07b9031: Serialize `runMigrations` with a session-level Postgres advisory lock, so API replicas that start at the same time no longer race to apply the same migrations.
- Updated dependencies [46d5bd6]
  - @repo/logger@1.2.0

## 1.8.0

### Minor Changes

- 0d5959c: The API now sweeps storage objects of deleted and abandoned Attachments on an interval (`STORAGE_SWEEP_INTERVAL_MS`, default 15 minutes; `STORAGE_SWEEP_ENABLED=false` turns it off). A Postgres advisory lock keeps it to one replica, and a new `files.purged_at` column records each removed object. A failed delete is retried on the next run, and the sweep never deletes a key outside the row's organization prefix.

## 1.7.0

### Minor Changes

- 9cbf84c: Type the Attachment entity type as the `AttachmentEntityType` GraphQL enum (`general`, `todo`) and a `files.entity_type` pgEnum. Migration `0010` maps any other stored value to `general` first; the API now rejects unknown entity types at the GraphQL boundary.
- a1c0431: Adds two-factor sign-in (authenticator app, email code, backup codes), email one-time-code sign-in and password reset, optional Cloudflare Turnstile captcha, and a Have I Been Pwned check on new passwords; caches sessions in a signed cookie for five minutes and adds the better-auth performance indexes (ADR 0015).
- 67f4516: Add `@repo/db/testing` (`createTestDatabase()`: PGlite with every migration applied) and the `Database` type. The API builds one scoped data-access module per request (`context.data.ts`) that alone writes the organization predicate, stamps inserts, clamps pagination, and escapes search phrases; feature adapters no longer import the `db` singleton.

### Patch Changes

- 519408c: Give the `files.entity_type` migration test the 30 s timeout that other PGlite migration tests use, so it no longer times out on a loaded CI runner and blocks the Release workflow.

## 1.6.3

### Patch Changes

- 25e0a60: Raise the default scrypt cost to N=16384, r=8, p=5, the 16 MiB variant of the OWASP minimum. Existing hashes keep verifying and are rehashed on the next login.
- @repo/logger@1.1.0

## 1.6.2

### Patch Changes

- 9f617ba: Align @aws-sdk/client-s3 with s3-request-presigner after #203, and bump drizzle-kit patch.
  - @repo/logger@1.1.0

## 1.6.1

### Patch Changes

- 5aa8a1d: Clear fixable Trivy CRITICAL findings in the API Docker image via workspace overrides (shell-quote, tar, esbuild), catalog bumps (vitest, drizzle-orm), and drop the unused base-image npm (nested tar) from the API runner stage.

## 1.6.0

### Minor Changes

- fdce5d8: Template audit follow-through fixes:
  - `@repo/api`: batch `Todo.attachments` and `Note.todos` through per-request DataLoaders, surface attachment lookup failures instead of returning `[]`, and reject `createTodo` inputs whose `noteId` belongs to another organization.
  - `@repo/db`: add organization-scoped indexes on `todos`, `notes`, and `files` (migration `0008`).
  - `@repo/config`: enforce `@typescript-eslint/no-explicit-any` as an error.
  - `@repo/translation`: locale-consistency test now discovers namespaces from disk, covering `assistant`, `notes`, and `storage`.

### Patch Changes

- 22a7c4d: Close a batch of principal architecture review findings: honest package `dev` scripts, stronger catalog enforcement, fuller `create:package` wiring, Vitest UI/`test:watch`, digest-pinned Docker bases with a blocking Trivy CRITICAL gate, and CI/DX hardening (knip/boundaries on PRs, safer concurrency, caches, launch configs).
- 44b7eaa: Assistant review fixes:
  - `@repo/api`: scope assistant conversation lookups to the owning user so same-organization members can no longer read or continue another user's conversation, send the latest window of messages (instead of the oldest 50) to the model, warn at startup when `API_CORS_ORIGINS` is unset in production, and drop the unused `noteId` field from `CreateTodoInput`.
  - `@repo/db`: add indexes for assistant conversations and messages (migration `0009`).

- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 79fa89e: Complete TypeScript project references for tsc-emitting packages: composite `tsconfig.build.json` + `tsc -b`, while typecheck keeps source paths (issue #147).
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

- Updated dependencies [22a7c4d]
- Updated dependencies [7bdc15c]
- Updated dependencies [1114f7e]
- Updated dependencies [79fa89e]
- Updated dependencies [21b3002]
  - @repo/logger@1.1.0

## 1.5.0

### Minor Changes

- 87e6d0b: Add a Notes feature and multi-chat assistant. Notes have a title, a body, and a
  checklist of todos (todos gain a nullable `note_id`, detached on note delete). Notes are
  managed at `/notes` + `/notes/:id` and can also be created/updated by the AI assistant
  via new tools (`createNote` with an inline checklist, `listNotes`, `updateNote`,
  `addTodoToNote`); note changes stream live over `note:*` subscriptions. The assistant page
  becomes multi-chat: conversations are listed, resumable, and deletable, message history
  loads on open, and each assistant turn surfaces clickable links to the notes it created.

## 1.4.0

### Minor Changes

- f136b60: Add an agentic AI assistant example that extends the todo generator. A new `/assistant`
  chat runs a multi-step tool-calling loop (Vercel AI SDK `streamText` + `stepCountIs`) that
  can create, list, complete, update, and delete todos through org-scoped tools. Replies stream
  token-by-token over a new `assistantMessageDelta` subscription, and the assistant page shows a
  live todo list driven by the existing `todo:*` events. Conversations and messages are persisted
  in new `assistant_conversations` and `assistant_messages` tables. The assistant provider config
  falls back to the existing `AI_TODO_PROVIDER`/`AI_TODO_MODEL` (OpenAI/DeepSeek) settings.

## 1.3.0

### Minor Changes

- c046f32: Introduce the better-auth instance (drizzle adapter, custom scrypt hooks, organization + bearer plugins) and align the database schema; passwords migrate to credential accounts
- 68ebc61: Serve /api/auth/\* through better-auth's node handler; ServerAuth slims to the session/read facade; signup invariants move to better-auth database hooks. users.password_hash becomes nullable so better-auth-created users need no legacy hash.
- 9cc4adf: Drop the superseded users.password_hash column (credential accounts are authoritative) and polish client member-list/slug-retry edges

## 1.2.0

### Minor Changes

- f884c6b: Add optional email verification on signup (AUTH_REQUIRE_EMAIL_VERIFICATION, soft mode): users.email_verified column + migration, hashed verification tokens with atomic claim, emailVerified exposed on the session user payload, and /api/auth/verify-email plus session-authenticated /api/auth/resend-email-verification
- d03004e: Add organization invitation lifecycle: create/list/accept/revoke with role rules, expiry, and email notification. New REST routes under /api/auth/organization/invitation/\* and an invitations GraphQL query. Membership rows are now enforced unique per (organization, user) via a new unique index and migration, and invitation acceptance flips status and inserts the membership atomically. Note: the migration fails if duplicate (organization, user) member rows already exist — dedupe manually before migrating. Migration 0001 also backfills the `files` table and `file_status` enum, which previously existed only in schema source; databases provisioned via `db:push` from an earlier main already have them and must skip those statements when adopting `db:migrate`.

### Patch Changes

- 3733f8d: Replace unsalted SHA-256 password hashing with salted scrypt; legacy hashes still verify and are rehashed on login. Seed data uses the new format.

## 1.1.1

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

## 1.0.0

### Major Changes

- 9633894: First release test
