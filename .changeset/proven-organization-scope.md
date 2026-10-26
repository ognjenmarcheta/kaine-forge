---
"@repo/auth": major
"@repo/api": patch
---

`@repo/auth/scope` now has one producer of `AuthenticatedOrganizationScope`: `resolveOrganizationScope`, which proves Organization Membership and returns the optional scope plus `requireOrganizationScope`. `membership` is required, and the unchecked `requireAuthenticatedOrganizationScope` and the old `resolveAuthenticatedOrganizationScope` exports are removed.
