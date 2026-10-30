import { createActiveOrganizationQueryKey } from "@repo/query";
import { ClientError } from "graphql-request";

import {
  useBillingQuery,
  useOpenBillingPortalMutation,
  useStartCheckoutMutation,
  type BillingQuery
} from "../../graphql/generated/react-query";

/** The GraphQL error codes the API uses when the Plan refuses an action. */
export type PlanErrorCode = "PLAN_LIMIT_REACHED" | "PLAN_FEATURE_REQUIRED";

/** The Plan refusal behind a failed request, or null for any other failure. */
export function planErrorOf(error: unknown): PlanErrorCode | null {
  if (!(error instanceof ClientError)) {
    return null;
  }

  for (const graphqlError of error.response.errors ?? []) {
    const code = graphqlError.extensions?.["code"];
    if (code === "PLAN_LIMIT_REACHED" || code === "PLAN_FEATURE_REQUIRED") {
      return code;
    }
  }

  return null;
}

export type BillingStatus = BillingQuery["billing"];

/** Opens Paddle's overlay checkout for a transaction the API created. */
async function openPaddleCheckout(
  clientConfig: NonNullable<BillingStatus["clientConfig"]>,
  transactionId: string,
  successUrl: string
): Promise<void> {
  // Loaded on demand: only a Paddle deployment's owner ever needs it.
  const { initializePaddle } = await import("@paddle/paddle-js");
  const paddle = await initializePaddle({
    token: clientConfig.clientToken,
    environment: clientConfig.environment === "production" ? "production" : "sandbox"
  });

  if (!paddle) {
    throw new Error("Paddle.js did not load");
  }

  paddle.Checkout.open({ transactionId, settings: { successUrl } });
}

/**
 * The Active Organization's Plan, and the owner's checkout and portal
 * actions. The API takes the Organization from the session and refuses both
 * actions without billing:manage; this only offers them.
 */
export function useBilling(organizationId: string | null) {
  const queryKey = createActiveOrganizationQueryKey(useBillingQuery.getKey(), organizationId);
  const billing = useBillingQuery(undefined, {
    queryKey,
    select: (data) => data.billing,
    // The API needs an Active Organization; without one the request only fails.
    enabled: organizationId !== null
  });
  const checkout = useStartCheckoutMutation({
    onSuccess: async ({ startCheckout }) => {
      if (startCheckout.mode === "redirect" && startCheckout.url) {
        window.location.assign(startCheckout.url);
        return;
      }

      const clientConfig = billing.data?.clientConfig;
      if (!clientConfig || !startCheckout.transactionId) {
        throw new Error("the overlay checkout needs a client config and a transaction");
      }

      const successUrl = new URL(window.location.href);
      successUrl.search = "?checkout=success";
      await openPaddleCheckout(clientConfig, startCheckout.transactionId, successUrl.toString());
    }
  });
  const portal = useOpenBillingPortalMutation({
    onSuccess: ({ openBillingPortal }) => window.location.assign(openBillingPortal)
  });

  return { billing, checkout, portal };
}
