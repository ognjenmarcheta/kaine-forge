import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

const BILLING_TAB = /^(Billing|navigation\.billing)$/;
const BILLING_OFF =
  /^(Billing is off for this deployment\. Every feature is available, with no limits\.|billing\.off)$/;

// The e2e API runs with BILLING_PROVIDER unset (none): the template's default.
test("shows the Billing tab with billing off and no checkout", async ({ page }) => {
  await signIn(page);
  await page.goto("/organization/billing");

  await expect(page.getByRole("link", { name: BILLING_TAB })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByText(BILLING_OFF)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Choose Pro|billing\.choose\.pro)$/ })
  ).toHaveCount(0);
});
