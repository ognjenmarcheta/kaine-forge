export const BILLING_CONFIG = {
  webhookPathPrefix: "/api/billing/webhooks/",
  /** Provider events are a few kilobytes; anything near this is not one. */
  webhookMaxBodyBytes: 1024 * 1024,
  /** Where checkout and the portal send the owner back, under WEB_APP_URL. */
  returnPath: "/organization/billing"
} as const;
