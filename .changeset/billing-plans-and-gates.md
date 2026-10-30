---
"@repo/billing": minor
"@repo/api": minor
"@repo/auth": minor
"@repo/db": minor
---

Add billing Plans and Plan gates. The new `@repo/billing` package holds the Plan catalog (free,
pro, business, and unlimited while billing is off) and resolves an Organization's Entitlements
from its subscriptions. The API adds a `billing` query, refuses a Todo past the Plan's todo limit
with `PLAN_LIMIT_REACHED`, and refuses the assistant on a Plan without it with
`PLAN_FEATURE_REQUIRED`. `BILLING_PROVIDER` defaults to `none`, which gives every Organization the
unlimited Plan. The database adds the billing customer, subscription, and event tables, and the
owner role gains the owner-only `billing:manage` Permission.
