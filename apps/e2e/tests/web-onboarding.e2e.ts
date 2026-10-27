import { expect, test } from "@playwright/test";

import { AUTH_LABELS, NAV_LABELS, ONBOARDING_LABELS, signIn, submitSignUp } from "./helpers/auth";

const ORG_NAME_LABEL = /^(Organization name|organizations\.name)$/;

test("names the organization once after sign-up and never shows onboarding again", async ({
  page
}) => {
  const uniqueSuffix = Date.now().toString(36);
  const account = {
    email: `e2e-onboarding-${uniqueSuffix}@test.test`,
    name: `E2E Onboarding ${uniqueSuffix}`,
    password: `E2e-${uniqueSuffix}-Pass!`
  } as const;
  const organizationName = `Onboarded ${uniqueSuffix}`;

  await page.goto("/auth");
  await submitSignUp(page, account);
  await expect(page).toHaveURL(/\/onboarding$/);

  // Step 1 renames the Personal Organization.
  await expect(page.getByRole("heading", { name: ONBOARDING_LABELS.nameTitle })).toBeVisible();
  const nameField = page.getByLabel(ORG_NAME_LABEL);
  await expect(nameField).toHaveValue("Personal");
  await nameField.fill(organizationName);
  await page.getByRole("button", { name: ONBOARDING_LABELS.rename }).click();

  // Step 2 is skipped without an invitation.
  await expect(page.getByRole("heading", { name: ONBOARDING_LABELS.inviteTitle })).toBeVisible();
  await page.getByRole("button", { name: ONBOARDING_LABELS.skip }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: NAV_LABELS.organization })).toContainText(
    organizationName
  );

  await page.getByRole("button", { name: account.name }).click();
  await page.getByRole("menuitem", { name: AUTH_LABELS.logout }).click();
  await expect(page).toHaveURL(/\/auth$/);

  // Signing in again goes straight to the dashboard, and /onboarding sends it there too.
  await signIn(page, account);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard$/);
});
