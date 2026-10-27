---
"@repo/auth": minor
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/translation": minor
---

Security-relevant and membership actions now write an Audit Event: member invited, member joined, member removed, member left, member role changed, ownership transferred, Organization renamed, Organization deleted, Invitation revoked, Attachment deleted, and, as user-level events with no Organization, two-factor turned on, two-factor turned off, and password changed. Each event stores the actor, the target, typed metadata, the client IP under the rate limiter's proxy rule, the user agent, and the time. A failed audit write is logged and never fails the action.

Owners and admins read the Active Organization's Audit Events through the new `auditEvents(first, after)` GraphQL query (newest first, cursor on `(created_at, id)`, default 20, maximum 100) and on the web app's new `/audit-log` page, which the sidebar shows only to them. A member gets `admin role required`.

`@repo/auth` adds `@repo/auth/audit` (`recordAuditEvent`, `runWithAuditRequest`) and `@repo/auth/audit.definition` (the closed action union and its metadata shapes). `@repo/db` migration `0016` adds the `audit_events` table with no foreign keys, so an event outlives its actor and its Organization. Retention is not set; #710 owns it.
