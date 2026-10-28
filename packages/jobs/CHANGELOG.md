# @repo/jobs

## 1.0.1

### Patch Changes

- @repo/email@1.3.1

## 1.0.0

### Major Changes

- 1e5e82d: Organizations get API Keys and Webhook Endpoints (#709).

  `@repo/auth` registers the official `@better-auth/api-key` add-on (catalog `1.7.12`) with `references: "organization"`. Only its create and verify endpoints are registered, and `/api-key/create` is in `disabledPaths`, so keys are managed through GraphQL with the Active Organization from the session. The add-on stores the SHA-256 hash of each key and returns the plain key (prefix `kf_`) once. The Permission catalog gains `apiKey:create`, `apiKey:read`, `apiKey:delete`, `webhook:create`, `webhook:read`, `webhook:update` and `webhook:delete`, granted to owner and admin and grantable by Custom Roles. A key grants its creator's Permissions except access changes (`apiKeyGrantablePermissions`: no API Key, Webhook Endpoint, role, member, invitation or Organization changes, and no Organization export); `resolveApiKeyScope` builds an Authenticated Organization Scope for the key's Organization whose Permissions are the ones the key grants that the creator still holds, and marks it with `apiKeyId`. An Audit Event recorded under a key request names the key in its metadata. Breaking: `ServerAuth` gains `resolveApiKey` and `createApiKey`, so every implementation and test fake needs them. New Audit Event actions: `api_key_created`, `api_key_revoked`, `webhook_endpoint_created`, `webhook_endpoint_updated`, `webhook_endpoint_deleted`, `webhook_secret_rotated`.

  `@repo/jobs` adds the `webhook.deliver` job (6 attempts, exponential backoff from 30 s). Breaking: `createJobHandlers` requires a `deliverWebhook` handler.

  `@repo/db` migration adds `api_keys`, `webhook_endpoints` and `webhook_deliveries`.

  `@repo/api`: a `/graphql` request with an `x-api-key` header acts as the key's Organization, with its own rate limit bucket; an unknown, revoked or expired key gets 401, a client over its address limit gets 429 before any key lookup, and a malformed key never reaches the database. A key request lists only its own Organization and cannot read its creator's own data. New GraphQL fields `apiKeys`, `createApiKey`, `revokeApiKey`, `webhookEventTypes`, `webhookEndpoints`, `webhookDeliveries`, `createWebhookEndpoint`, `updateWebhookEndpoint`, `rotateWebhookSecret` and `deleteWebhookEndpoint`, and `AuditEvent.apiKeyId`. Webhook URLs must use port 443, and Audit Events record them without the query string. Every organization event (`todo:*`, `note:*`) is delivered to the Organization's subscribed Webhook Endpoints as a JSON POST signed with HMAC-SHA256 over `<timestamp>.<body>`. An SSRF guard refuses loopback, private, link-local and unique-local IPv4 and IPv6 addresses at create, update and every attempt, connects to the checked address, and never follows redirects. Each attempt is written to the delivery log, which housekeeping deletes after `RETENTION_WEBHOOK_DELIVERIES_DAYS` (30).

  `@repo/web` adds the `/api-keys` and `/webhooks` pages, shown to members who hold the read Permission. `@repo/ui` exports the `KeyRound` and `Webhook` icons. `@repo/translation` adds their strings in en, sr and de. `@repo/logger` redacts the `x-api-key` header.

### Minor Changes

- a54d7ff: Users can export their own data, owners can export the Active Organization's data, and API housekeeping now applies retention windows.

  An export runs as the `data.export` job on `@repo/jobs` and writes one zip to the private bucket: a JSON file per entity plus `files-manifest.json` (each uploaded Attachment's key, name, content type, and size; no bytes). A user export holds the profile, current Organization Memberships, and the user's own todos, notes, assistant conversations and messages (without tool results, which can quote other members' content), and Attachment metadata, in the Organizations they still belong to. An Organization export holds the Organization, its members, Custom Roles, Invitations, todos, notes, and Attachment metadata, but no assistant conversations: they are private to their author, who exports them with a user export. Archives never hold a password hash, session token, OAuth token, or two-factor secret. `SECURITY.md` lists each file.

  GraphQL adds `dataExports(kind, first, after)`, `requestDataExport(kind)`, and `dataExportDownloadUrl(id)`. The organization kind needs the new owner-only `organization:export` Permission and takes the Organization from the session. One pending or running export per user and export kind (not per Organization); a second request fails with code `DATA_EXPORT_IN_PROGRESS`. When the archive is ready, the requester gets the new `dataExportReady` email, and account settings and organization settings show a download action (a presigned URL). Each Organization export records an `organization_exported` Audit Event, and each of its download links an `organization_export_downloaded` Audit Event. An export whose JSON passes 256 MiB fails with `failureReason: too_large` (streaming is issue #753).

  Housekeeping (advisory lock, one replica at a time) deletes a ready archive after `DATA_EXPORT_ARCHIVE_DAYS` (7) and marks its export `expired`, failed and expired export rows after `RETENTION_DATA_EXPORTS_DAYS` (30), purged Attachment rows after `RETENTION_PURGED_FILES_DAYS` (30), Audit Events after `RETENTION_AUDIT_EVENTS_DAYS` (365), and Notifications after `RETENTION_NOTIFICATIONS_DAYS` (90). An export stuck pending or running for a day is marked failed. `startHousekeeping` now takes a `run` function.

  `@repo/db` migration `0022` adds `data_exports`. `@repo/jobs` `createJobHandlers` now requires a `dataExport` handler. The API adds `jszip` from the catalog.

- d1fa587: Transactional emails now have an HTML part and a plain-text part, rendered with React Email (`@react-email/render`) from typed templates in the recipient's language: password reset, email verification, invitation, two-factor code, the four email one-time codes, a new welcome email, and new security alerts for a password change (also after a reset), an email change (sent to the previous address), and two-factor turning on.

  `@repo/email`: `EmailMessage` gains an optional `html` (absent only for a text-only message). The Resend adapter sends `html` and `text`; the console adapter logs recipient, subject, and text only. `renderEmail(template, locale)` renders `{ subject, html, text }` with a fixed locale and falls back to `DEFAULT_LANGUAGE`; it never changes the shared i18next language. User-supplied names are escaped in the HTML part.

  `@repo/jobs`: the `email.send` payload carries `html`. It stays optional for one release, so a job queued by the previous release still goes out as text only. Every auth email still goes through this job with retries, and auth responses do not wait for rendering or enqueueing.

  `@repo/db` migration `0015` adds a nullable `users.locale`. `@repo/auth` exposes it as a user field that accepts only `en`, `sr`, or `de`, and `AuthTransport.updateEmailLanguage` writes it. Web sign-up sends the UI language, and the web language switch stores a change for the signed-in user. An invitation uses the inviter's stored language, and a change-email code uses the requesting user's language. The welcome email carries no user-supplied text, and sign-up and `/update-user` refuse a name longer than 64 characters (`NAME_TOO_LONG`).

  `@repo/translation` adds the `email` namespace in `en`, `sr`, and `de`. `@repo/config` compiles `.tsx` in Node workspaces (`jsx: react-jsx`).

### Patch Changes

- Updated dependencies [729d942]
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
  - @repo/db@2.0.0
  - @repo/email@1.3.0
  - @repo/logger@1.2.1

## 0.1.0

### Minor Changes

- 32c958f: Add a Postgres background job runner (ADR 0018). The new `@repo/jobs` package wraps pg-boss on the existing `DATABASE_URL`, with typed job definitions, retries with backoff, and a bounded `stop()`. Its tables live in the `pgboss` schema, which pg-boss creates on start.

  The API starts the job queue after migrations and after it listens, runs the job handlers by default, and stops them before the database pool closes on shutdown. Set the new `JOBS_RUNNER_ENABLED=false` to keep the API enqueue-only and run `node apps/api/dist/worker.js` from the same image as a separate worker.

  `@repo/auth` no longer sends email inline. Every auth email (password reset, email verification, invitation, two-factor code, and email one-time codes) is enqueued as an `email.send` job and delivered by the runner, which retries a failed send. A process that imports `@repo/auth/instance` must now call `jobQueue.start()` from `@repo/jobs/client`, and run the runner or a worker, or auth emails are not delivered.
