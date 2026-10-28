# Billing

Billing charges an **Organization** for a **Plan** through Stripe or Paddle. Each deployment uses one provider. Billing is off by default (`BILLING_PROVIDER=none`): every Organization then has the unlimited Plan, and nothing is gated. ADR 0019 records the design.

## Plans

The catalog lives in code, in `packages/billing/src/billing.definition.ts`:

| Plan        | Pricing    | Todos    | Assistant | For sale         |
| ----------- | ---------- | -------- | --------- | ---------------- |
| `free`      | flat       | 50       | no        | no (the default) |
| `pro`       | flat       | no limit | yes       | yes              |
| `business`  | per member | no limit | yes       | yes              |
| `unlimited` | flat       | no limit | yes       | no (billing off) |

The provider owns the prices. Set one price ID for each Plan and interval you sell: `BILLING_PRICE_PRO_MONTH`, `BILLING_PRICE_PRO_YEAR`, `BILLING_PRICE_BUSINESS_MONTH`, `BILLING_PRICE_BUSINESS_YEAR`. A webhook for any other price answers 500 and logs `price ... is not in the billing catalog`. Add the missing variable, and the provider's retry stores the subscription.

## Stripe

1. Create the products and prices. Set the `BILLING_PRICE_*` variables to the price IDs.
2. Set `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, and `WEB_APP_URL`.
3. Create a webhook endpoint at `<API_URL>/api/billing/webhooks/stripe` on API version `2026-09-30.endive`. Send at least `checkout.session.completed` and the `customer.subscription.*` events. Set `STRIPE_WEBHOOK_SECRET` to its signing secret.
4. In the Customer Portal settings, allow plan changes between your prices and cancellation. **Turn off quantity changes:** seat sync owns the quantity of a per-seat Plan.

Test webhooks locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/api/billing/webhooks/stripe
```

## Paddle

1. Create the products and prices in a product collection, so the customer portal can move between them. Set the `BILLING_PRICE_*` variables to the price IDs.
2. Set `BILLING_PROVIDER=paddle`, `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_ENVIRONMENT` (`sandbox` or `production`), and `WEB_APP_URL`. Approve the web app's domain in Paddle.
3. Create a notification destination at `<API_URL>/api/billing/webhooks/paddle` with the `subscription.*` and `transaction.completed` events. Set `PADDLE_WEBHOOK_SECRET` to its secret.
4. **Turn off quantity changes** in the customer portal for the per-seat Plan.
5. On the web image, set `CSP_BILLING_ORIGINS=https://*.paddle.com`. To allow wallet payments in the checkout, also set `BILLING_PAYMENT_ORIGINS` (see `docs/deploy.md`).

Paddle keeps one customer per email address, so an owner's Organizations share one Paddle customer, and each has its own subscription. Paddle cannot reach `localhost`: test webhooks through a tunnel, or with the webhook simulator in the Paddle dashboard.

## Behavior

- Only the owner (`billing:manage`) starts a checkout or opens the portal. Every member sees the Plan and usage on `/organization/billing`. Mobile shows the Plan read-only, with no purchase link.
- `active`, `trialing`, and `past_due` keep the paid Plan; the provider retries a failed payment and emails the customer. A cancellation at period end keeps the Plan until then.
- A downgrade never deletes data. Creates past a limit fail with `PLAN_LIMIT_REACHED`; a feature outside the Plan fails with `PLAN_FEATURE_REQUIRED`.
- Adding or removing a member queues a `billing.syncSeats` job for a per-seat Plan. An hourly reconcile corrects any other drift, such as a member who left.
- Deleting an Organization, directly or with the owner's account, cancels its subscriptions first. The delete fails with `BILLING_CANCEL_FAILED` when the provider refuses.
- Checkout, portal opens, and webhook changes write Audit Events. Housekeeping deletes processed webhook event ids after 30 days.

## Limits

- One provider per deployment. Moving an Organization between providers is not supported.
- Usage-based billing, coupons, and an invoice list in the app are not built; the provider portal shows invoices.
- The organization data export does not include billing tables.
