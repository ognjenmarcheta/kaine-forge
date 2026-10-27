---
"@repo/auth": major
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/translation": minor
"@repo/email": minor
---

Authorization checks named Permissions instead of role ranks. `@repo/auth/permissions` defines one catalog with better-auth's `createAccessControl`: the organization plugin's statements plus `todo`, `note`, `attachment`, `logo`, and `audit`, with `organization:transfer` and `invitation:read` added. The owner, admin, and member roles grant exactly what they granted before, and the organization plugin receives the catalog through its `ac` and `roles` options.

The Authenticated Organization Scope now carries `membership.permissions`, read with the membership on every request. `hasOrganizationPermission(scope, permission)` and `requireOrganizationPermission(scope, permission)` in `@repo/auth/scope` answer every server check; a refused check throws `permission required: <permission>` (it was `admin role required`). Todo, Note, and Attachment writes, the organization logo, the audit log, and the invitation list each check their Permission. The new `organizationPermissions` GraphQL query returns the caller's Permissions, and the web app shows controls from them.

Owners create, list, update, and delete Custom Roles for the Active Organization through better-auth dynamic access control (at most 25 per Organization). A Custom Role cannot grant an owner-only Permission, reuse a built-in role name, take a name outside 2 to 32 lowercase letters, digits, or hyphens, or be renamed. An invite or a role change cannot give the owner role, even inside a comma-separated role, or a role with a Permission the caller does not hold. A role change or a removal is refused when the member holds a Permission the caller does not, and a Custom Role cannot be deleted while a pending Invitation gives it. Custom Role changes write `role_created` and `role_updated` Audit Events with the granted Permissions, and `role_deleted`. `generateTodos` checks `todo:create` before any model call, and the invitation email names a Custom Role. The members page gains a Custom Roles section for owners, and invites and role changes offer Custom Roles.

Migration `0018` adds the `organization_roles` table and widens `members.role` and `invitations.role` to `text`, because a member can hold several comma-separated roles.

Breaking for `@repo/auth` consumers: `hasRoleAtLeast`, `ORGANIZATION_ROLE_HIERARCHY`, and `AssignableOrganizationRole` are removed, and `AuthenticatedOrganizationMembership` and `OrganizationMembershipProof` require `permissions`. Build a test scope's permissions with `resolveRolePermissions(role, [])`.
