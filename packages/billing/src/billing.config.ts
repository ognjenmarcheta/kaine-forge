import { BILLING_PROVIDERS } from "./billing.definition";
import { createNoneBillingProvider } from "./billing.none";
import { createPaddleBillingProvider, PADDLE_ENVIRONMENTS } from "./billing.paddle";
import { resolvePriceCatalog } from "./billing.prices";
import { createStripeBillingProvider } from "./billing.stripe";
import type { BillingProvider } from "./billing.type";

function requireKeys<TKey extends string>(
  env: Record<string, string | undefined>,
  provider: string,
  keys: readonly TKey[]
): Record<TKey, string> {
  const values: Partial<Record<TKey, string>> = {};
  const missing: TKey[] = [];

  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      values[key] = value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `BILLING_PROVIDER=${provider} requires ${missing.join(", ")}; set them or use BILLING_PROVIDER=none`
    );
  }

  // SAFETY: every key in `keys` was assigned above, or the function threw.
  return values as Record<TKey, string>;
}

export function createBillingProvider(
  env: Record<string, string | undefined> = process.env
): BillingProvider {
  const provider = env.BILLING_PROVIDER?.trim() || BILLING_PROVIDERS.NONE;

  if (provider === BILLING_PROVIDERS.NONE) {
    return createNoneBillingProvider();
  }

  if (provider === BILLING_PROVIDERS.STRIPE) {
    const keys = requireKeys(env, provider, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    return createStripeBillingProvider({
      secretKey: keys.STRIPE_SECRET_KEY,
      webhookSecret: keys.STRIPE_WEBHOOK_SECRET,
      prices: resolvePriceCatalog(env)
    });
  }

  if (provider === BILLING_PROVIDERS.PADDLE) {
    const keys = requireKeys(env, provider, [
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_CLIENT_TOKEN"
    ]);
    const environment = env.PADDLE_ENVIRONMENT?.trim() || "sandbox";

    if (environment !== "sandbox" && environment !== "production") {
      throw new Error(`PADDLE_ENVIRONMENT must be one of ${PADDLE_ENVIRONMENTS.join(", ")}`);
    }

    return createPaddleBillingProvider({
      apiKey: keys.PADDLE_API_KEY,
      webhookSecret: keys.PADDLE_WEBHOOK_SECRET,
      clientToken: keys.PADDLE_CLIENT_TOKEN,
      environment,
      prices: resolvePriceCatalog(env)
    });
  }

  throw new Error(
    `unknown BILLING_PROVIDER "${provider}"; implement BillingProvider for it and register the provider in createBillingProvider`
  );
}
