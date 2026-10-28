---
"@repo/jobs": minor
"@repo/auth": minor
"@repo/api": minor
---

Sync per-seat billing and cancel subscriptions of deleted Organizations. Adding or removing a
member queues a `billing.syncSeats` job, which sets a per-seat subscription's provider quantity to
the member count and retries while the provider is unavailable. A reconcile sweep corrects
quantities that drifted without a hook, such as after a member leaves. Deleting an Organization,
directly or with the owner's account, cancels its paid subscriptions first and fails with
`BILLING_CANCEL_FAILED` when the provider refuses. `@repo/auth/billing` holds the hooks the API sets.
