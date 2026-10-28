export const billingTypeDefs = /* GraphQL */ `
  enum BillingProviderName {
    none
    stripe
    paddle
  }

  enum BillingPlan {
    free
    pro
    business
    # Every Organization while billing is off.
    unlimited
  }

  enum SubscriptionStatus {
    active
    trialing
    past_due
    canceled
    unpaid
    paused
    incomplete
    expired
  }

  enum BillingInterval {
    month
    year
  }

  enum BillingCheckoutMode {
    # Send the browser to url.
    redirect
    # Open the provider's overlay checkout for transactionId.
    overlay
  }

  type BillingCheckout {
    mode: BillingCheckoutMode!
    url: String
    transactionId: String
  }

  # What the browser needs to open a Paddle.js checkout. Never a secret.
  type BillingClientConfig {
    clientToken: String!
    environment: String!
  }

  type BillingLimitUsage {
    key: String!
    # Null when the Plan has no cap.
    max: Int
    used: Int!
  }

  type BillingStatus {
    provider: BillingProviderName!
    # Set for a provider whose checkout runs in the browser; null for a redirect.
    clientConfig: BillingClientConfig
    plan: BillingPlan!
    # The status of the subscription that grants the Plan, else of the latest one.
    subscriptionStatus: SubscriptionStatus
    cancelAtPeriodEnd: Boolean!
    currentPeriodEnd: DateTime
    features: [String!]!
    limits: [BillingLimitUsage!]!
  }

  extend type Query {
    # The Active Organization's Plan, its status, and usage against its limits.
    # A create past a limit fails with code PLAN_LIMIT_REACHED; a feature the
    # Plan lacks fails with code PLAN_FEATURE_REQUIRED.
    billing: BillingStatus!
  }

  extend type Mutation {
    # Starts a checkout of a Plan for the Active Organization. Requires
    # billing:manage and a signed-in owner. Fails with code BAD_USER_INPUT for
    # a Plan that is not for sale or when the Organization already has a paid
    # Plan, which the billing portal changes instead.
    startCheckout(plan: BillingPlan!, interval: BillingInterval!): BillingCheckout!
    # A short-lived URL of the provider's billing portal. Requires billing:manage.
    openBillingPortal: String!
  }
`;
