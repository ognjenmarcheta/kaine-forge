---
"@repo/auth": major
---

Remove the legacy unsalted SHA-256 password verify fallback. `verifyPassword` now returns false for any stored hash that is not a `scrypt$N$r$p$salt$hash` value.

Breaking change for deployments that still hold SHA-256 password hashes: those users can no longer log in and must reset their password. Hashes created before the 2026-07-04 better-auth migration stay SHA-256 until the user logs in once. Count the remaining ones before you upgrade:

```sql
select count(*) from accounts
where provider_id = 'credential' and password is not null and password not like 'scrypt$%';
```
