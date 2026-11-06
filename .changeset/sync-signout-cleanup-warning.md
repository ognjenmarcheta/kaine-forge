---
"@repo/web": patch
"@repo/mobile": patch
"@repo/translation": patch
---

Sign-out now warns when some of the User's data could not be deleted from this device: a toast on
web and desktop, an alert on mobile. The sign-out still completes, and the next deletion retries.
