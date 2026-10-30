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

  type BillingLimitUsage {
    key: String!
    # Null when the Plan has no cap.
    max: Int
    used: Int!
  }

  type BillingStatus {
    provider: BillingProviderName!
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
`;
