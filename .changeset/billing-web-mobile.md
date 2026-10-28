---
"@repo/web": minor
"@repo/mobile": minor
"@repo/translation": minor
---

Add the Billing tab. Every member sees the Organization's Plan, its status, and usage at
`/organization/billing`; the owner chooses a larger Plan (Stripe Checkout redirect or the Paddle.js
overlay) or opens the provider's billing portal. A failed payment shows a warning. Creating a Todo
past the Plan's limit, or using the assistant without it, shows a message with a link to the Billing
tab. Mobile adds a read-only Plan screen and the plan-limit message. The web image accepts
`CSP_BILLING_ORIGINS` and `BILLING_PAYMENT_ORIGINS` for the Paddle checkout.
