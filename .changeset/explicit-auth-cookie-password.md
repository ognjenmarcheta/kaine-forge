---
"@repo/auth": patch
---

State the session cookie attributes (`Secure` from an `https://` base URL, `HttpOnly`, `SameSite=Lax`) and the server-side minimum password length (`AUTH_PASSWORD_MIN_LENGTH`, shared with the forms) in the better-auth config instead of inheriting library defaults. Behavior is unchanged for current deployments.
