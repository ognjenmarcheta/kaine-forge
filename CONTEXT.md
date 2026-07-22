# Kaine Forge Context

Kaine Forge is a monorepo template for organization-scoped apps. This context names the product concepts that should shape API, auth, data, and client architecture.

## Language

**Organization**:
A tenant-like workspace that owns user-created data and membership.
_Avoid_: account, team

**Active Organization**:
The organization selected on the current authenticated session for scoped data access.
_Avoid_: selected team, current account

**Organization Membership**:
The relationship proving a **User** belongs to an **Organization**, including the user's role in that Organization.
_Avoid_: team membership, account access

**Authenticated Organization Scope**:
An API request identity containing an authenticated user and their active organization as resolved from the session.
_Avoid_: auth context, org context

**Todo**:
A template example of organization-scoped user-created data.
_Avoid_: global task

**Attachment**:
A stored file associated with organization-scoped user-created data, such as a **Todo**.
_Avoid_: raw upload, blob

**Invitation**:
A pending offer for an email address to join an **Organization** with a role (admin or member). Only an authenticated **User** whose email matches can accept it; it expires and can be revoked by admins.
_Avoid_: invite link, access request

**Email Verification**:
Confirmation that a **User** controls their email address, recorded on the user and exposed on the session. Soft by default: it does not gate login; apps decide what to gate on it.
_Avoid_: account activation

## Relationships

- A **User** belongs to one or more **Organizations** through membership.
- An **Organization Membership** belongs to exactly one **User** and exactly one **Organization**.
- A **Session** has zero or one **Active Organization** before authentication checks, and scoped API work requires one.
- An **Authenticated Organization Scope** belongs to exactly one **User** and exactly one **Active Organization**.
- User-created data belongs to exactly one **Organization** unless explicitly system-level.
- A **Todo** belongs to exactly one **Organization** through the **Authenticated Organization Scope** used when it is created.
- An **Attachment** belongs to exactly one **Organization** and may be associated with a **Todo**.
- An **Invitation** belongs to exactly one **Organization** and targets exactly one email address; accepting it creates an **Organization Membership** with the invited role.

## Example dialogue

> **Dev:** "Should the todo resolver accept an organization id from the client?"
> **Domain expert:** "No. It should use the **Authenticated Organization Scope** so todos are filtered by the **Active Organization** resolved from the session."

## Template platform surfaces

This repository is a multi-platform **template**. Reference features are not required to ship on every client surface. Use this matrix when adding or reviewing product work so agents do not invent mobile parity that the template does not claim.

| Surface                      | Role in the template                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **API** (`apps/api`)         | Canonical GraphQL + auth for all clients.                                                       |
| **Web** (`apps/web`)         | Primary product UI and Playwright e2e surface. Desktop reuses the web build via Tauri.          |
| **Mobile** (`apps/mobile`)   | Subset client: auth, dashboard, todos (+ attachments), shared org session. Not full web parity. |
| **Desktop** (`apps/desktop`) | Tauri shell around web — no separate feature tree.                                              |

**Mobile-supported reference features (today):** auth, dashboard, todos (CRUD and attachments), organization session/switch when `ORGANIZATIONS_VISIBLE` is enabled (members route is thin).

**Web-first / web-only reference features (API + web; not mobile UI or mobile GraphQL ops):** notes, assistant (and any new feature that does not explicitly opt into mobile).

**When a new feature must include mobile:** only when the task or product policy says so, or when the feature is meant to replace/extend the mobile-supported set above. Default for “add a feature” is API + web; add mobile operations and screens as an explicit follow-up, not an implied requirement.

**Do not** treat missing mobile notes/assistant as a bug unless the product scope requires mobile parity.

## Flagged Ambiguities

- "context" can mean GraphQL runtime context or domain request identity. Use **Authenticated Organization Scope** for the domain request identity used by organization-scoped API work.
- "full-stack feature" can mean API + web only, or API + web + mobile. Prefer the **Template platform surfaces** matrix over assuming mobile is required.
