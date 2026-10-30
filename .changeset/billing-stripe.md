---
"@repo/billing": minor
"@repo/api": minor
"@repo/auth": minor
"@repo/translation": patch
---

Add Stripe billing. With `BILLING_PROVIDER=stripe`, an organization owner starts a Stripe Checkout
with the `startCheckout` mutation and opens the Stripe Billing Portal with `openBillingPortal`.
`POST /api/billing/webhooks/stripe` verifies each Stripe event, refetches the subscription from
Stripe, and stores its current state, so repeated or out-of-order events cannot corrupt it; a
price outside the catalog answers 500 so Stripe retries. Checkout, portal, and webhook changes
write Audit Events, and housekeeping purges processed billing event ids after 30 days.
