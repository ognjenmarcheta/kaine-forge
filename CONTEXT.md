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

## Relationships

- A **User** belongs to one or more **Organizations** through membership.
- An **Organization Membership** belongs to exactly one **User** and exactly one **Organization**.
- A **Session** has zero or one **Active Organization** before authentication checks, and scoped API work requires one.
- An **Authenticated Organization Scope** belongs to exactly one **User** and exactly one **Active Organization**.
- User-created data belongs to exactly one **Organization** unless explicitly system-level.

## Example dialogue

> **Dev:** "Should the todo resolver accept an organization id from the client?"
> **Domain expert:** "No. It should use the **Authenticated Organization Scope** so todos are filtered by the **Active Organization** resolved from the session."

## Flagged Ambiguities

- "context" can mean GraphQL runtime context or domain request identity. Use **Authenticated Organization Scope** for the domain request identity used by organization-scoped API work.
