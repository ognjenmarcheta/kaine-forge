import type { BillingInterval, CheckoutResult, PlanKey } from "@repo/billing";

import type { ApiContext } from "../../context";

type ResolverContext = ApiContext;
type StartCheckoutArgs = { plan: PlanKey; interval: BillingInterval };

function checkoutView(checkout: CheckoutResult) {
  return checkout.kind === "redirect"
    ? { mode: "redirect", url: checkout.url, transactionId: null }
    : { mode: "overlay", url: null, transactionId: checkout.transactionId };
}

export const billingResolvers = {
  Query: {
    async billing(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      ctx.requireOrganizationScope();
      return ctx.billing.status();
    }
  },
  Mutation: {
    async startCheckout(_parent: unknown, args: StartCheckoutArgs, ctx: ResolverContext) {
      return checkoutView(await ctx.billing.startCheckout(args.plan, args.interval));
    },
    async openBillingPortal(_parent: unknown, _args: unknown, ctx: ResolverContext) {
      return ctx.billing.openPortal();
    }
  }
};
