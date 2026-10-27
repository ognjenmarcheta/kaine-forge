---
"@repo/query": patch
"@repo/auth": patch
"@repo/web": patch
---

A new or accepted Organization now stays the Active Organization. `@repo/auth` refreshes the session cookie after `/organization/create`, so the 5-minute cookie cache no longer returns the previous Active Organization. `@repo/query` stores the new id and reloads the organization list before it switches the session, and keeps a remembered id that a stale list does not show yet. `syncActiveOrganizationProvider` takes an optional `isSessionLoading`: while the session loads, it no longer clears the remembered Active Organization, so a page reload keeps the selected Organization instead of switching to the first one.
