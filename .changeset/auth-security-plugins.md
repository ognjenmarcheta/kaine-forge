---
"@repo/auth": minor
"@repo/db": minor
"@repo/api": minor
"@repo/web": minor
"@repo/mobile": minor
"@repo/query": patch
"@repo/ui": patch
"@repo/translation": patch
---

Adds two-factor sign-in (authenticator app, email code, backup codes), email one-time-code sign-in and password reset, optional Cloudflare Turnstile captcha, and a Have I Been Pwned check on new passwords; caches sessions in a signed cookie for five minutes and adds the better-auth performance indexes (ADR 0015).
