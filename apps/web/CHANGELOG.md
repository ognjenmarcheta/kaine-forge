# @repo/web

## 1.15.0

### Minor Changes

- e64ae54: Add the Organization Theme: every member of an Organization sees the theme it picks. The `organizations` table gains a nullable `theme` column (migration `0025`). The API adds the `organizationTheme` query and the `setOrganizationTheme(theme: String)` mutation. The mutation needs the `organization:update` Permission, accepts only registered theme names, and records an `organization_theme_changed` Audit Event when the value changes. Organization settings show a Theme section when more than one theme is registered. The web and mobile apps apply the theme at runtime, and signed-out pages use the default theme.
- e64ae54: Themes are now data in the new `@repo/theme` package. Byte Forge stays the default with unchanged colors, and Moss is an example custom theme. `pnpm theme:build` writes the web tokens and utilities, the mobile tokens, the NativeWind preset tokens, and each theme's `DESIGN.md`. It fails when a theme misses WCAG 2.2 AA contrast or the 24px target size. `createTheme` derives a full theme from a brand color, a neutral tint, fonts, density, and depth. `pnpm ui:check` runs the accessibility and UI lint rules, and `pnpm lab` previews themes and components.

  Breaking changes:

  - `@repo/ui`: the web gets theme utilities (`bg-ds-surface-raised`, `p-ds-200`, `text-body`, `rounded-card`, `shadow-card`), and the default Tailwind palette, font sizes, radii, and shadows generate no CSS. Replace `text-sm` with `text-body`, `text-xs` with `text-body-sm`, and `bg-[var(--ds-*)]` with the matching utility.
  - `@repo/ui` and `@repo/config`: 127 unused tokens are removed, including the accent hues and the attention, severe, open, closed, and done families. `--ds-lineHeight-*` is renamed `--ds-line-height-*`, and the `--ds-base-*` tier is gone.
  - The root element now carries `data-color-mode="light|dark"`, and `data-theme` names the theme. The Tailwind `dark:` variant follows `data-color-mode`.
  - `@repo/mobile-ui`: `nativeThemeTokens` is keyed by theme name, and the `fontFamilies` export is removed. Wrap the app in `ThemeRoot` and read colors with `useThemeTokens()`.
  - `@repo/translation`: `navigation.theme*` and `desk.prefs.theme*` are now `navigation.appearance*` and `desk.prefs.appearance*`, and the label reads "Appearance".
  - `@repo/ui`: `AvatarGroup` requires an `aria-label`, and with `max` an `overflowLabel`.

  New components: `Table`, `SegmentedControl`, `Kbd`, `ProportionBar`, and the charts `LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, and `Sparkline` in `@repo/ui`; `ProgressBar`, `DonutChart`, and `BarChart` in `@repo/mobile-ui`. Chart series take a fixed `color` (a chart slot, a role, or `"neutral"`), and the charts add dashed lines, reference lines, value labels, a highlighted bar, legend positions, and hidden axes.

  Shared components gain what designs kept rebuilding. `Button` has `appearance="outline"` and `spacing="icon"`. `CardTitle` takes `as`. `StatCard` takes any value node, an `icon`, a `delta` badge, a `description`, and an `action`. `Checkbox` draws the indeterminate state and has a 24px hit area. `Banner` has `emphasis="subtle"`, and it is a polite `status` unless `urgent`. `Table` scrolls by keyboard when it overflows and takes `scrollLabel`. `AppSidebar` holds its parts in one navigation landmark named by `label`. `CommandMenu` returns focus to where it opened. Web fields and selects are 40px high.

  The `@repo/ui` CSS now sits in cascade layers, so a utility in `className` wins over a component's own CSS. The new `ui/no-reset-default` lint rule reports Tailwind defaults that the theme removes, such as `rounded`, `text-sm`, and `bg-red-500`, and the motion tokens are used through `duration-*` and `ease-standard` instead of arbitrary values.

  A second round added `appearance="raised"` on `Button`, `FilterMenu`, `CardAction`, `TopNav`, `StatCard` part slots and a `visual` slot, `AvatarFallback` tones, `PageHeader size="display"`, `CopyButton labelSuffix`, chart dots, annotations, gradient areas, bar tracks, horizontal bars and highlight colors, a colored `RadialProgress`, and `Gauge`. A focus ring no longer fades in, a labelled sidebar group is a named group, a sidebar count describes its link, and the contrast check now covers role borders, chart colors, and raised fills on cards and sunken areas.

  Themes gain a `display` type step (`text-display`), per-step `type` changes and a `color.darkSurface` lightness in `createTheme`, and the motion utilities `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`. In dark mode, derived cards sit one step above the page and sunken areas one step below it, and the contrast check also measures text, charts, and role borders on cards and sunken areas. Field borders now reach 3:1 against the surface, and the email fallback link now reaches 4.5:1.

### Patch Changes

- e64ae54: The Assistant keeps a reader's place in a long conversation. It decided whether to follow the newest message from the last scroll event, so a re-render in the same frame as the reader's scroll, such as a keystroke in the composer, could pull the list to the end. It now reads the list's position when the messages change.
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
  - @repo/theme@0.1.0
  - @repo/ui@2.0.0
  - @repo/auth@5.1.0
  - @repo/translation@1.13.0
  - @repo/feature-flags@1.2.0
  - @repo/persistence@1.1.2
  - @repo/query@2.0.0
  - @repo/storage@1.6.0
  - @repo/todos@1.1.0

## 1.14.0

### Minor Changes

- a26fb69: The signed-in web app is redesigned for clearer navigation and safer actions.

  `@repo/web`: the sidebar groups pages into Workspace (Dashboard, Todos, Notes, Assistant) and Organization (Organization, Audit log). Organization and Account settings are tabbed pages whose tab is in the URL: `/organization/{general,members,roles,data}` and `/account/{profile,security,sessions,notifications,data}`. The old `/members` and `/security` links redirect to the matching tab. The dashboard shows the Active Organization's open Todo, Note, and unread notification counts, a quick add for open Todos, and recent Notes, chats, and activity with "View all" links. Revoking an Invitation, changing a member's role, signing out one or all other sessions, unlinking a sign-in method, declining an Invitation, and requesting account deletion now ask for confirmation and report success. The header has a "Search…" button and a Cmd/Ctrl+K command menu to go to a page, open a settings tab, create an item, switch Organization, or change theme and language. The sign-in page's login and sign-up choice is a link pair kept in `?mode=signup`.

  `@repo/api`: GraphQL adds `todoCounts` (`open`, `completed`) and `noteCount`, both counted in the Active Organization from the session.

  `@repo/ui` adds `PageHeader`, `EmptyState`, `QueryError`, `SettingsSection`, `StatCard`, `CopyButton`, and `CommandMenu` (built on `cmdk`), and exports `tabsListClassName` and `tabsTriggerClassName` for link-based tab navigation. The active sidebar item uses the selected tokens with an inset start indicator.

  `@repo/translation` adds the strings for the new navigation, dashboard, confirmations, and command menu.

### Patch Changes

- 4dcc509: Avatars and organization logos accept AVIF images. `@repo/storage` recognises the AVIF file signature and the `.avif` extension; the API decodes AVIF and publishes it as the usual square WebP. Image Attachments still accept only JPEG, PNG, GIF, and WebP; document and spreadsheet Attachments are unchanged. AVIF image sequences (`avis`) are rejected, because the image library cannot decode them.
- 0100b46: `@repo/api` adds `uploadsEnabled: Boolean!` to the `PublicAssets` type. It is false when `S3_PUBLIC_BUCKET` or `S3_PUBLIC_BASE_URL` is unset. A Public Asset upload to such a deployment now fails with the GraphQL error code `PUBLIC_ASSETS_NOT_CONFIGURED` instead of a masked internal error.

  `@repo/web` hides the "Choose image" control for the profile picture and the organization logo when uploads are off, and shows a short note instead of "The image could not be saved" for every image.

- Updated dependencies [4dcc509]
- Updated dependencies [0100b46]
- Updated dependencies [dd1a7c8]
- Updated dependencies [a26fb69]
  - @repo/storage@1.6.0
  - @repo/translation@1.12.0
  - @repo/query@2.0.0
  - @repo/ui@1.10.0
  - @repo/auth@5.0.2

## 1.13.1

### Patch Changes

- 531038d: Hide a Todo attachment thumbnail that fails to load, so an image uploaded before thumbnails existed no longer shows as a broken image.
- Updated dependencies [5f59692]
  - @repo/auth@5.0.1

## 1.13.0

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

- 5752644: A new or accepted Organization now stays the Active Organization. `@repo/auth` refreshes the session cookie after `/organization/create`, so the 5-minute cookie cache no longer returns the previous Active Organization. `@repo/query` stores the new id and reloads the organization list before it switches the session, and keeps a remembered id that a stale list does not show yet. `syncActiveOrganizationProvider` takes an optional `isSessionLoading`: while the session loads, it no longer clears the remembered Active Organization, so a page reload keeps the selected Organization instead of switching to the first one.
- 9efcac9: Breaking GraphQL change: the `todos`, `notes`, `conversations`, `assistantMessages`, and `files` list fields take `first: Int` and `after: String` instead of `limit` and `offset`, and return a `<Type>Connection` (`TodoConnection`, `NoteConnection`, `AssistantConversationConnection`, `AssistantMessageConnection`, `FileInfoConnection`) with `items` and the shared `pageInfo { hasNextPage endCursor }`. `FilesFilterInput` no longer has `limit` or `offset`. The `auditEvents` query keeps `first` and `after` but returns `AuditEventConnection` (`items`, `pageInfo`) instead of `AuditEventPage` (`events`, `endCursor`, `hasNextPage`). Pass the previous page's `endCursor` as `after` to read the next page. A cursor is opaque and pages by the list's sort key plus `id`, so rows inserted or deleted between two requests no longer shift or repeat a page. A malformed cursor, or one from another list or another Organization, returns the GraphQL error `invalid cursor` (`BAD_USER_INPUT`). The web Todo, Note, assistant, and audit-log lists and the mobile Todo list use the new shape; their UI does not change.
- Updated dependencies [729d942]
- Updated dependencies [5752644]
- Updated dependencies [1e5e82d]
- Updated dependencies [a54d7ff]
- Updated dependencies [fc6f746]
- Updated dependencies [d1fa587]
- Updated dependencies [8be54b9]
- Updated dependencies [a9cc2b2]
- Updated dependencies [5752644]
- Updated dependencies [6839bae]
- Updated dependencies [4e3873d]
- Updated dependencies [a2b6d40]
  - @repo/auth@5.0.0
  - @repo/ui@1.9.0
  - @repo/translation@1.11.0
  - @repo/query@1.3.8
  - @repo/feature-flags@1.2.0
  - @repo/persistence@1.1.2
  - @repo/storage@1.5.0
  - @repo/todos@1.1.0

## 1.12.0

### Minor Changes

- 2e2bd97: `/graphql` now requires the `x-graphql-yoga-csrf` header on GET requests and on POSTs without a content type or with `text/plain`, `application/x-www-form-urlencoded`, or `multipart/form-data`; those requests get 403 without it. JSON POSTs are unaffected, and allowlisted origins may send the header through CORS. The web, desktop, and mobile GraphQL clients send `x-graphql-yoga-csrf: 1`; other GraphQL clients that use GET must send it too. Every API response, including `/api/auth/*`, `/health`, and 429s, carries `X-Content-Type-Options: nosniff`. The web image sends `Content-Security-Policy`, `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), and `Permissions-Policy` on every response, including `/assets/` and `index.html`. Set `CSP_STORAGE_ORIGINS`, `CSP_PUBLIC_ASSET_ORIGINS`, and, for a cross-origin API, `CSP_API_ORIGINS` on the web container when they differ from the same-origin defaults; otherwise the browser blocks uploads and storage images.

### Patch Changes

- Updated dependencies [32c958f]
  - @repo/auth@4.0.0

## 1.11.0

### Minor Changes

- 12ad7c5: The web app now names each browser tab `<route title> · <app name>` and updates it when the language changes. `index.html` carries the product name, a meta description, and Open Graph tags that template adoption rewrites. The app serves a permissive `robots.txt` and adds public `/terms` and `/privacy` stub pages, linked from a new auth page footer. `AuthLayout` takes an optional `footer` slot.
- 2ddc1a9: A web route that throws now shows a translated error page with "Try again" and "Go to dashboard" actions, and keeps the app shell when the failure is inside it. An unknown URL now shows a translated not-found page instead of a silent redirect to the dashboard.

### Patch Changes

- Updated dependencies [12ad7c5]
- Updated dependencies [2ddc1a9]
  - @repo/ui@1.8.0
  - @repo/translation@1.10.0
  - @repo/auth@3.0.3

## 1.10.1

### Patch Changes

- Updated dependencies [591495f]
  - @repo/auth@3.0.2

## 1.10.0

### Minor Changes

- 6d93644: Uploaded image Attachments are re-encoded without metadata (EXIF, GPS) and get a WebP thumbnail (`FileInfo.thumbnailUrl`), shown in the web attachment list. Users can set an avatar and organization admins can set a logo: both are Public Assets, re-encoded as square WebP and served from a separate public bucket through a CDN (`S3_PUBLIC_BUCKET`, `S3_PUBLIC_BASE_URL`). The storage sweep also clears unconfirmed Public Asset uploads.

### Patch Changes

- Updated dependencies [6d93644]
  - @repo/storage@1.5.0
  - @repo/ui@1.7.2

## 1.9.1

### Patch Changes

- Updated dependencies [9a5f4f3]
  - @repo/storage@1.4.0
  - @repo/auth@3.0.1

## 1.9.0

### Minor Changes

- a1c0431: Adds two-factor sign-in (authenticator app, email code, backup codes), email one-time-code sign-in and password reset, optional Cloudflare Turnstile captcha, and a Have I Been Pwned check on new passwords; caches sessions in a signed cookie for five minutes and adds the better-auth performance indexes (ADR 0015).

### Patch Changes

- 9cbf84c: Type the Attachment entity type as the `AttachmentEntityType` GraphQL enum (`general`, `todo`) and a `files.entity_type` pgEnum. Migration `0010` maps any other stored value to `general` first; the API now rejects unknown entity types at the GraphQL boundary.
- f3caf78: Serve the built API and web app in the CI PR e2e job when `E2E_SERVE_BUILD=true`, instead of the tsx API and the Vite dev server. Local runs and Release keep the dev servers. The web build adds the Playwright fixture page only with `E2E_FIXTURES=true`; the shipped build is unchanged.
- 7b8bd4d: The API builds its organization-filtered subscription resolvers from one map of fields to `PubSubEventMap` events. The web uses the generated subscription documents through `useLiveTodos` and `useLiveNotes`, so the hand-written subscription strings are gone, and the Todo subscriptions select only `id`.
- Updated dependencies [9cbf84c]
- Updated dependencies [56c7d80]
- Updated dependencies [a1c0431]
- Updated dependencies [68fc597]
  - @repo/storage@1.3.0
  - @repo/auth@3.0.0
  - @repo/query@1.3.7
  - @repo/ui@1.7.1
  - @repo/translation@1.9.1

## 1.8.2

### Patch Changes

- Updated dependencies [527509e]
- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
- Updated dependencies [b7011e2]
  - @repo/ui@1.7.0
  - @repo/translation@1.9.0
  - @repo/auth@2.0.0
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.2
  - @repo/todos@1.1.0

## 1.8.1

### Patch Changes

- Updated dependencies [4f69756]
  - @repo/translation@1.8.0
  - @repo/ui@1.6.0

## 1.8.0

### Minor Changes

- 3408a45: Adopt the Byteforge brand as the default light and dark themes. The palette uses one orange for actions, selection, links, and focus, on cool white and ink-black neutrals, with matching success, information, warning, and danger roles and a darker amber severe role. Text on orange fills uses the new `--ds-text-brand-inverse` token so it meets WCAG AA, and a contrast contract test checks the key pairs in both themes. Web, desktop, and mobile use Geist and Geist Mono, self-hosted. Shapes follow the site: pill buttons, 8px inputs, 12px menus, and 20px cards and dialogs. Shadows are ink-tinted, the easing is a quick ease-out, and buttons scale to `--ds-motion-press-scale` (0.97) on press. This replaces `--ds-motion-distance-press`, and `@repo/mobile-ui` exports `motionPressScale` and `fontFamilies` and drops `motionDistances.press`. A new mark, an olive tree growing through the Byteforge anvil, replaces the app icons, favicon, and README logo, and its Blender source and render script are in `media/brand/`.

### Patch Changes

- Updated dependencies [3408a45]
  - @repo/ui@1.5.0
  - @repo/auth@2.0.0
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.2
  - @repo/todos@1.1.0
  - @repo/translation@1.7.0

## 1.7.6

### Patch Changes

- Updated dependencies [6a30ea3]
- Updated dependencies [850ba14]
  - @repo/translation@1.7.0
  - @repo/auth@2.0.0

## 1.7.5

### Patch Changes

- Updated dependencies [5786f03]
- Updated dependencies [078f259]
- Updated dependencies [078f259]
  - @repo/translation@1.6.0

## 1.7.4

### Patch Changes

- Updated dependencies [e047bf0]
  - @repo/ui@1.4.0

## 1.7.3

### Patch Changes

- Updated dependencies [1ce6a5f]
- Updated dependencies [25e0a60]
  - @repo/auth@1.6.0
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.2
  - @repo/todos@1.1.0
  - @repo/translation@1.5.0
  - @repo/ui@1.3.1

## 1.7.2

### Patch Changes

- Updated dependencies [cb7174c]
  - @repo/translation@1.5.0
  - @repo/ui@1.3.1

## 1.7.1

### Patch Changes

- Updated dependencies [b39e2d4]
  - @repo/translation@1.4.1
  - @repo/auth@1.5.2
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.2
  - @repo/todos@1.1.0
  - @repo/ui@1.3.0

## 1.7.0

### Minor Changes

- 99a5fc9: Redesign existing client workflows with neutral light and dark themes, consistent motion, responsive navigation, and clearer form feedback. Preserve drafts during preference changes and failed submissions.

  Reset route state when the Active Organization changes, prevent pending forms from being edited or dismissed, and improve checklist and Attachment controls. Keep collapsed sidebar preferences contained and long menus scrollable.

- 6907d18: Refresh Notes with a responsive list and editor, full Organization-scoped title/body search, pagination, explicit saving, protected per-note drafts, and clearer checklist feedback. Preserve newer edits during saves and prevent accidental draft loss during navigation and Organization changes.
- db46fcf: Refresh Todos with inline creation, searchable status views, pagination, protected drafts, and clearer action and attachment feedback. Keep text edits separate from completion changes across web and mobile, and preserve Organization scoping.
- 4143c11: Refresh the AI Assistant with a responsive conversation workspace, a growing keyboard-accessible composer, per-conversation drafts, and readable Todo and Note results. Keep replies attached to their originating conversation during navigation and preserve prompts after failures.

### Patch Changes

- 28ab725: Add consistent entry and exit motion to drawers, dialogs, menus, tooltips, and Attachment disclosures. Smooth sidebar collapse and preference placement, preserve upload and form state, and respect device reduced motion. Share generated motion easing and distances with native controls and keep interrupted native dialog exits safe.

  Add stable, labeled Language and Theme footer rows with current values, native language names, and accessible radio menus. Keep their vertical positions fixed during collapse and preserve menu focus, drafts, and saved preferences.

- Updated dependencies [99a5fc9]
- Updated dependencies [28ab725]
- Updated dependencies [6907d18]
- Updated dependencies [db46fcf]
- Updated dependencies [4143c11]
  - @repo/ui@1.3.0
  - @repo/translation@1.4.0
  - @repo/todos@1.1.0

## 1.6.2

### Patch Changes

- Updated dependencies [cd623ee]
  - @repo/translation@1.3.2

## 1.6.1

### Patch Changes

- 67abc54: Add a client-safe `@repo/storage/client` entry and move the web and mobile upload hooks onto it. The root barrel re-exported the S3 client, which pulled `@aws-sdk/client-s3` and its `node:https` handler into the Expo bundle and broke `expo export`. ESLint now rejects server-only package entries in client apps, and pull requests that touch shared packages or the lockfile run the mobile export.
- Updated dependencies [67abc54]
  - @repo/storage@1.2.2

## 1.6.0

### Minor Changes

- fc1395e: Upgrade web tooling to Vite 8 (Rolldown-powered build, lightningcss minification). Replace the invalid `var()` media query in `globals.css` with its literal breakpoint value: media queries cannot consume custom properties, so the sub-768px layout block previously never matched in any browser and now applies as intended. Closes the vite workstream from the 2026-08 security triage.

### Patch Changes

- ceef03e: Intentional dependency upgrades from issue #198: Dependabot freezes for mobile singleton packages, jsdom 30, web React 19.2 catalog, GraphQL Codegen v7 suite with client regenerate, and Expo SDK 55 mobile graph (RN 0.83, expo ~55).
- 25b6cc4: Remove the unused `@graphql-codegen/typescript` dependency (the codegen config uses only the `client` preset plus `typescript-operations`/`typescript-react-query`), declare `@commitlint/types` at the root for the commitlint config's JSDoc type import, and refresh generated GraphQL clients with the lockfile-current codegen toolchain. Fixes the `pnpm knip` failure on `main` and the latent `graphql-schema` regeneration drift.
- Updated dependencies [ceef03e]
- Updated dependencies [9f617ba]
- Updated dependencies [14601b7]
- Updated dependencies [fc1395e]
  - @repo/ui@1.2.1
  - @repo/auth@1.5.2
  - @repo/storage@1.2.1
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/todos@1.0.4
  - @repo/translation@1.3.1

## 1.5.2

### Patch Changes

- Updated dependencies [5aa8a1d]
  - @repo/auth@1.5.1

## 1.5.1

### Patch Changes

- 2df98af: Fix the broken web/desktop build by adding the missing `@repo/auth/form` Vite (and mobile Vitest) alias, correct the default `API_CORS_ORIGINS` to the web dev port, migrate organization-scoped query keys to `createActiveOrganizationQueryKey` from `@repo/query` (deprecating `createTodoListQueryKey`), and harden template adoption to cover the `kaineforge`/`kaine_forge` identity forms, mobile auth prefixes, docs, and AI-source files so `template:adopt --check` passes after a by-the-book adoption.
- bfde85a: Deferred audit backlog hardening:
  - `@repo/e2e`: add behavioral Playwright coverage for register/login/logout and todo create/complete/delete flows with i18n-safe selectors, and fix the harness so browser GraphQL goes through the Vite proxy to the e2e API instead of the dev port from `.env`.
  - `@repo/mobile-ui`: add a vitest + jsdom test harness with a typed react-native stub and behavior tests for the Button, Checkbox, Badge, Text, and Input primitives.
  - `@repo/web`: raise the 12px todo attachment captions from `--ds-text-subtlest` to `--ds-text-subtle` to meet WCAG AA contrast (was 3.22:1 on white).

- 7bdc15c: Add dead-code and dependency-graph enforcement, and finish declaring the graph.

  `pnpm knip` and `pnpm boundaries` are new and both run in `pnpm check`. `turbo boundaries` complements the existing ESLint rules rather than replacing them: it catches importing a package a workspace does not declare, which ESLint cannot see, while ESLint keeps enforcing the web/mobile UI split and the `@repo/*/src` deep-import ban. `boundaries` is experimental in Turbo 2.8, which is why it is additive.

  `turbo boundaries` found 153 undeclared imports: 145 test files importing `vitest`, and `packages/config/eslint/*.js` importing six ESLint plugins. All resolved only through pnpm root hoisting. Every workspace that imports `vitest` now declares it, and the six plugins moved from the root to `@repo/config`, which is where they are imported — the root `eslint.config.mjs` only re-exports. `pnpm --filter <workspace> test` no longer depends on hoisting. One exception remains, marked with `@boundaries-ignore`: `packages/config/mobile-lan-dev.test.ts` reaches into `tooling/dev-mobile-lan.ts`, a loose root script with no workspace of its own to be tested from.

  knip is configured against this repo's conventions rather than run on defaults, which reported 63 false "unused files". Test files are entry points; the vitest `react-native` alias target, Expo/Metro config, and template placeholder files are ignored; the `exports` and `types` rules are off because this repo deliberately exports internals for unit testing. The dependency rule keeps an explicit ignore list for things static analysis cannot see: `pino-pretty` (referenced as a transport string), `tailwindcss` (a Tailwind v4 peer of `@tailwindcss/vite`), the `catalog:mobile` React Native singleton pins, Expo plugin inferences, and `zod` in `@repo/auth`.

  That last one is worth recording: knip reported `zod` as unused in `@repo/auth` and nothing imports it, but removing it breaks the build with TS2742 — better-auth's inferred types reference zod, so it is required for declaration emit. The pre-existing catalog alignment test already guarded it. **Verify a dependency removal with a build, not a grep.**

  Removed genuinely dead code that knip surfaced, each verified unreferenced first: eight source files across api/web/mobile, plus `react-i18next` from `@repo/translation` (declared but imported nowhere in the repo). Deleted `vitest.workspace.ts` — it used `defineWorkspace`, deprecated in the installed Vitest 3.2.4 and removed in 4, was invoked by nothing, and had drifted from `vitest.coverage.config.ts`, which is now the single project list.

  Normalized the four tsconfigs that extended the root base directly instead of the shared presets in `packages/config/typescript/`.

  Five new alignment tests, each verified to fail when violated: every workspace declares `@repo/config`; `globalDependencies` never lists the lockfile or globs a package; neither Dockerfile hand-copies `packages/config`; vitest importers declare vitest; ESLint plugins live in `@repo/config` and not the root.

- 6b03bd4: Add type-aware ESLint via the TypeScript project service: `no-floating-promises`, `no-misused-promises`, and `await-thenable` as errors across the repo (excluding files not covered by any tsconfig). Fix the 14 real violations it surfaced — `void`-wrapping async JSX event handlers and fire-and-forget lifecycle/teardown calls, and extracting the API server's async request handler — with no behavior change. `require-await` is intentionally not enabled (noise on async functions without `await`, e.g. resolvers).
- 7a6e25d: Rename TeamSwitcher public API to OrganizationSwitcher to match CONTEXT domain language.
- 81919a2: Share auth form validation across web and mobile via `@repo/auth/form`, and document intentional mobile-ui subset in the design system.
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

- ecd85d9: Web auth is cookie-only: stop persisting or sending durable bearer tokens from localStorage.
- 703a061: Validate the web client environment at boot with a zod schema (`apps/web/src/env.config.ts`), mirroring the API's validator. The app fails fast with a clear message on a misconfigured `VITE_GRAPHQL_URL` (e.g. a value missing its `http(s)://` protocol or leading `/`), and a blank `VITE_GRAPHQL_URL`/`VITE_AUTH_SOCIAL_PROVIDERS` now falls back to its default instead of overriding it with `""`. The GraphQL HTTP/WS clients and the auth config read the validated env.
- Updated dependencies [2df98af]
- Updated dependencies [22a7c4d]
- Updated dependencies [8d04ade]
- Updated dependencies [4c45e37]
- Updated dependencies [7bdc15c]
- Updated dependencies [8be5914]
- Updated dependencies [2a37f9d]
- Updated dependencies [7a6e25d]
- Updated dependencies [81919a2]
- Updated dependencies [b64b17a]
- Updated dependencies [fdce5d8]
- Updated dependencies [79fa89e]
- Updated dependencies [21b3002]
  - @repo/todos@1.0.4
  - @repo/auth@1.5.0
  - @repo/feature-flags@1.1.1
  - @repo/persistence@1.1.2
  - @repo/query@1.3.6
  - @repo/storage@1.2.0
  - @repo/translation@1.3.1
  - @repo/ui@1.2.0

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
  - @repo/translation@1.2.0
  - @repo/auth@1.4.1

## 1.3.0

### Minor Changes

- c1d66c1: Clients authenticate through better-auth's client (organization + bearer flows) with env-gated GitHub/Google social login buttons

### Patch Changes

- Updated dependencies [c046f32]
- Updated dependencies [68ebc61]
- Updated dependencies [b2b0a3e]
- Updated dependencies [4057465]
- Updated dependencies [c1d66c1]
- Updated dependencies [9cc4adf]
  - @repo/auth@1.4.0

## 1.2.11

### Patch Changes

- 881822c: Add HEALTHCHECK directives to Dockerfile.api (Node fetch against /health) and Dockerfile.web (wget against nginx)
- c9b20e0: Extend the local AuthUser session mirrors with the new emailVerified field exposed by @repo/auth sessions
- Updated dependencies [480a52d]
- Updated dependencies [f884c6b]
- Updated dependencies [d03004e]
- Updated dependencies [c72eb56]
- Updated dependencies [5d8d4a1]
- Updated dependencies [3733f8d]
  - @repo/ui@1.1.3
  - @repo/auth@1.3.0

## 1.2.10

### Patch Changes

- d5f6d92: Add AI todo generation with OpenAI and DeepSeek provider support.
- Updated dependencies [d5f6d92]
  - @repo/ui@1.1.2

## 1.2.9

### Patch Changes

- 9d42572: Deepen Todo client workflows and Active Organization provider orchestration while preserving app behavior.
- Updated dependencies [9d42572]
  - @repo/query@1.3.5
  - @repo/todos@1.0.3

## 1.2.8

### Patch Changes

- Updated dependencies [35d096a]
  - @repo/query@1.3.4

## 1.2.7

### Patch Changes

- 69f4711: Deepen API auth transport, storage lifecycle, shared upload/auth transitions, explicit query runtime registration, and preference persistence modules.
- Updated dependencies [69f4711]
  - @repo/query@1.3.3
  - @repo/storage@1.1.2
  - @repo/persistence@1.1.1

## 1.2.6

### Patch Changes

- 1d159d2: Deepen Authenticated Organization Scope, Active Organization lifecycle, Todo workflow, Attachment lifecycle, Translation runtime, API runtime, and GraphQL feature composition seams.
- Updated dependencies [1d159d2]
  - @repo/auth@1.2.2
  - @repo/query@1.3.2
  - @repo/todos@1.0.2
  - @repo/translation@1.1.1

## 1.2.5

### Patch Changes

- af949dd: Deepen shared auth, query, Todo, storage upload, persistence, and API scope architecture behind focused Modules and Adapters.
- Updated dependencies [af949dd]
  - @repo/auth@1.2.1
  - @repo/query@1.3.1
  - @repo/storage@1.1.1
  - @repo/todos@1.0.1

## 1.2.4

### Patch Changes

- 7b286b2: Deepen shared auth transport, organization-scoped query cache helpers, upload lifecycle, persistence adapters, and server auth internals.
- 7af7edb: Deepen organization-scoped auth, data access, client organization selection, and session transport.
- Updated dependencies [7b286b2]
- Updated dependencies [7af7edb]
  - @repo/auth@1.2.0
  - @repo/query@1.3.0
  - @repo/storage@1.1.0
  - @repo/persistence@1.1.0

## 1.2.3

### Patch Changes

- Updated dependencies [29a0d96]
  - @repo/auth@1.1.2

## 1.2.2

### Patch Changes

- efcb73a: Backport template-safe runtime hardening, Docker support, bearer auth fallback, organization members wiring, mobile UI primitives, and generated AI assistant scaffold.
- Updated dependencies [efcb73a]
  - @repo/auth@1.1.1

## 1.2.1

### Patch Changes

- 532bf1a: UI update
- Updated dependencies [07b5833]
- Updated dependencies [532bf1a]
  - @repo/ui@1.1.1

## 1.2.0

### Minor Changes

- 0ebaed1: Change graphql client

### Patch Changes

- Updated dependencies [0ebaed1]
  - @repo/query@1.2.0

## 1.1.0

### Minor Changes

- 42437fd: Multitenancy and organization implementation

### Patch Changes

- Updated dependencies [42437fd]
  - @repo/feature-flags@1.1.0
  - @repo/translation@1.1.0
  - @repo/auth@1.1.0
  - @repo/ui@1.1.0

## 1.0.0

### Major Changes

- 9633894: First release test

### Patch Changes

- Updated dependencies [9633894]
  - @repo/translation@1.0.0
  - @repo/auth@1.0.0
  - @repo/ui@1.0.0
