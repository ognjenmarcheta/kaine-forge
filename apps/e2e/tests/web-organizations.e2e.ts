import { expect, test } from "@playwright/test";

import { NAV_LABELS, signIn } from "./helpers/auth";

const ORG_CREATE_TITLE = /^(Create organization|organizations\.create)$/;
const ORG_NAME_LABEL = /^(Organization name|organizations\.name)$/;
const BUTTON_SAVE = /^(Save|button\.save)$/;

test("creates a second organization and can switch between organizations", async ({ page }) => {
  const orgName = `E2E Org ${Date.now().toString(36)}`;

  await signIn(page);

  // TeamSwitcher trigger uses aria-label from navigation.organization.
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await expect(switcher).toBeVisible();
  await switcher.click();

  await page.getByRole("menuitem", { name: NAV_LABELS.organizationCreate }).click();

  const dialog = page.getByRole("dialog", { name: ORG_CREATE_TITLE });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(ORG_NAME_LABEL).fill(orgName);
  await dialog.getByRole("button", { name: BUTTON_SAVE }).click();
  await expect(dialog).toHaveCount(0);

  // Open the switcher and select the new org (create may not auto-select in the UI).
  await switcher.click();
  await expect(page.getByRole("menuitem", { name: orgName })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("menuitem", { name: orgName }).click();
  await expect(switcher).toContainText(orgName, { timeout: 10_000 });

  // Switching back to Personal keeps the shell usable.
  await switcher.click();
  await page.getByRole("menuitem", { name: /^Personal$/ }).click();
  await expect(switcher).toContainText("Personal");
  await expect(page).toHaveURL(/\/dashboard$/);
});
