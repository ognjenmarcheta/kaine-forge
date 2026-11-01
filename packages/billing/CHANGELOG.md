# @repo/billing

## 0.1.0

### Minor Changes

- 214c6cc: Add Paddle billing. With `BILLING_PROVIDER=paddle`, `startCheckout` creates a Paddle transaction for
  the Paddle.js overlay checkout, `openBillingPortal` opens the Paddle customer portal, and
  `POST /api/billing/webhooks/paddle` verifies and stores Paddle subscription events the same way as
  Stripe's. The `billing` query returns the Paddle client token and environment for the browser
  checkout. An owner's Organizations share one Paddle customer, because Paddle keeps one customer per
  email address.
- 5659f20: Add billing Plans and Plan gates. The new `@repo/billing` package holds the Plan catalog (free,
  pro, business, and unlimited while billing is off) and resolves an Organization's Entitlements
  from its subscriptions. The API adds a `billing` query, refuses a Todo past the Plan's todo limit
  with `PLAN_LIMIT_REACHED`, and refuses the assistant on a Plan without it with
  `PLAN_FEATURE_REQUIRED`. `BILLING_PROVIDER` defaults to `none`, which gives every Organization the
  unlimited Plan. The database adds the billing customer, subscription, and event tables, and the
  owner role gains the owner-only `billing:manage` Permission.
- 474e9c1: Add Stripe billing. With `BILLING_PROVIDER=stripe`, an organization owner starts a Stripe Checkout
  with the `startCheckout` mutation and opens the Stripe Billing Portal with `openBillingPortal`.
  `POST /api/billing/webhooks/stripe` verifies each Stripe event, refetches the subscription from
  Stripe, and stores its current state, so repeated or out-of-order events cannot corrupt it; a
  price outside the catalog answers 500 so Stripe retries. Checkout, portal, and webhook changes
  write Audit Events, and housekeeping purges processed billing event ids after 30 days.

## 0.0.0

- Initial scaffold via `pnpm create:package`
