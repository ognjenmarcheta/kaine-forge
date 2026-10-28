# ADR 0019: Own provider-neutral billing package for Stripe and Paddle

- Status: Accepted
- Date: 2026-10-28

## Context

The template needed billing that works with Stripe or Paddle. The owner chose one provider per deployment (`BILLING_PROVIDER=none|stripe|paddle`), the Organization as the billing subject, a Plan catalog in code, hosted checkout and portals, and per-seat as well as flat Plans (issues #772–#776).

better-auth 1.7 has an official Stripe plugin, `@better-auth/stripe`, with Organization support. Paddle has no official better-auth plugin.

## Decision

Build our own package, `@repo/billing` (`packages/billing`), on the `@repo/email` pattern: one `BillingProvider` interface, one file per provider (`billing.stripe.ts`, `billing.paddle.ts`, `billing.none.ts`), and `createBillingProvider(env)` that selects one and validates its keys. Do not use `@better-auth/stripe`.

- **One schema.** `billing_customers`, `billing_subscriptions`, and `billing_events` (`packages/db/src/schema/billing.schema.ts`) store both providers with a `provider` column.
- **One webhook pipeline.** `POST /api/billing/webhooks/<provider>` (`apps/api/src/features/billing/billing.webhook*.ts`) verifies the signature on the raw body, skips a processed event id, refetches the subscription from the provider, and upserts it. It records the event id only after success, and a price outside the catalog answers 500 so the provider retries.
- **One entitlements model.** `resolveEntitlements` maps subscription status to a Plan for both providers, and the API gates resolve it from the Active Organization.
- **GraphQL, not REST.** Checkout, the portal, and the Plan are GraphQL operations on the Authenticated Organization Scope, so clients use generated operations.

## Alternatives

- **`@better-auth/stripe` plus a custom Paddle better-auth plugin.** It brings maintained Stripe webhook handling, trial-abuse checks, and seat support. It was rejected because:
  - Its `subscription` table and `organization.stripeCustomerId` column are Stripe-shaped, so Paddle would need another shape and the gates would merge two.
  - Its endpoints are REST under `/api/auth/*`; the template's clients use generated GraphQL operations.
  - The client sends `referenceId` (an Organization id) and `authorizeReference` checks it. The template never accepts a client-supplied Organization id.
  - Plan limits live in the plugin's config, so Paddle would need a second copy.
  - A Paddle better-auth plugin is new code that follows better-auth's plugin API and its breaking changes.

## Consequences

- Pros:
  - Stripe and Paddle share one schema, one webhook path, and one set of gates and tests.
  - Billing works with the existing permission model (`billing:manage`, owner only), audit log, job runner, and housekeeping.
- Cons:
  - The template maintains the event mapping and normalization for each provider (`normalizeStripeSubscription`, `normalizePaddleSubscription`).
  - A provider SDK upgrade (`stripe` pins its API version per major) is a reviewed change to the adapter and its tests.
