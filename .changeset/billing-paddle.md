---
"@repo/billing": minor
"@repo/api": minor
---

Add Paddle billing. With `BILLING_PROVIDER=paddle`, `startCheckout` creates a Paddle transaction for
the Paddle.js overlay checkout, `openBillingPortal` opens the Paddle customer portal, and
`POST /api/billing/webhooks/paddle` verifies and stores Paddle subscription events the same way as
Stripe's. The `billing` query returns the Paddle client token and environment for the browser
checkout. An owner's Organizations share one Paddle customer, because Paddle keeps one customer per
email address.
