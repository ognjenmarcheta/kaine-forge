---
"@repo/billing": patch
---

The Stripe client now uses API version `2026-11-18.endive`, the version that `stripe` 23.2.0 pins. Create new Stripe webhook endpoints on that version. An endpoint on `2026-10-28.endive` keeps working: the webhook handler reads only the subscription id from the event and fetches the subscription again.
