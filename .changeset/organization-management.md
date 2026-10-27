---
"@repo/auth": major
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/translation": minor
---

Owners and admins now run their Organization from the web app's Members page: invite by email and role, revoke pending Invitations, change roles between admin and member, remove members, rename the Organization, and (owners) transfer ownership or delete it. Any member can leave. An invited person opens `/invitations/:invitationId`, signs in or signs up, comes back to the same page, and accepts or declines. `/auth?redirect=<path>` accepts only same-origin relative paths.

`@repo/auth` breaking changes: the organization routes that act on one Organization (`invite-member`, `remove-member`, `update-member-role`, `update`, `leave`, `delete`) take the Active Organization from the session and refuse a different `organizationId` with `ACTIVE_ORGANIZATION_MISMATCH`. `invite-member` and `update-member-role` refuse the `owner` role; ownership moves only through the new `POST /organization/transfer-ownership`, which runs in one transaction and moves `organizations.user_id`. A Personal Organization cannot be deleted, left, or transferred. `AuthClientOrganization` has a required `personal` field. The invitation email carries the accept URL built from the new `WEB_APP_URL` (default `http://localhost:3000`), which the API validates at startup.

`@repo/db` migration `0013` adds `organizations.personal`, marks existing personal organizations, and adds an `organization_storage_purges` queue that a trigger fills on every Organization delete. The API storage sweep deletes a deleted Organization's private `<organizationId>/` objects and, best effort, its logo.
