import { expect, test } from "@playwright/test";

import { signIn, signUp } from "./helpers/auth";

const ACCOUNT_LABELS = {
  menuItem: /^(Account|navigation\.account)$/,
  name: /^(Name|auth\.account\.profile\.nameLabel)$/,
  saveName: /^(Save name|auth\.account\.profile\.save)$/,
  currentPassword: /^(Current password|auth\.account\.password\.currentLabel)$/,
  newPassword: /^(New password|auth\.account\.password\.newLabel)$/,
  changePassword: /^(Change password|auth\.account\.password\.submit)$/,
  passwordChanged: /^(Your password has been changed\.|auth\.account\.password\.changed)$/,
  sessions: /^(Sessions|auth\.account\.sessions\.title)$/,
  thisDevice: /^(This device|auth\.account\.sessions\.thisDevice)$/,
  signOut: /^(Sign out|auth\.account\.sessions\.revoke)$/
} as const;

test("changes the name and password, then signs out another session", async ({
  browser,
  baseURL,
  page
}) => {
  const uniqueSuffix = Date.now().toString(36);
  const account = {
    email: `e2e-account-${uniqueSuffix}@test.test`,
    name: `E2E Account ${uniqueSuffix}`,
    password: `E2e-${uniqueSuffix}-Pass!`
  } as const;
  const newName = `Renamed ${uniqueSuffix}`;
  const newPassword = `E2e-${uniqueSuffix}-New!`;

  await signUp(page, account);

  // The account page opens from the sidebar user menu.
  await page.getByRole("button", { name: account.name }).click();
  await page.getByRole("menuitem", { name: ACCOUNT_LABELS.menuItem }).click();
  await expect(page).toHaveURL(/\/account$/);

  // The sidebar shows the new name without a reload.
  await page.getByLabel(ACCOUNT_LABELS.name).fill(newName);
  await page.getByRole("button", { name: ACCOUNT_LABELS.saveName }).click();
  await expect(page.getByRole("button", { name: new RegExp(newName) })).toBeVisible();

  await page.getByLabel(ACCOUNT_LABELS.currentPassword).fill(account.password);
  await page.getByLabel(ACCOUNT_LABELS.newPassword).fill(newPassword);
  await page.getByRole("button", { name: ACCOUNT_LABELS.changePassword }).click();
  await expect(page.getByText(ACCOUNT_LABELS.passwordChanged)).toBeVisible();

  // A second device signs in with the new password.
  const otherContext = await browser.newContext(baseURL ? { baseURL } : {});
  const otherPage = await otherContext.newPage();

  try {
    await signIn(otherPage, { email: account.email, password: newPassword });

    await page.reload();
    const sessions = page
      .getByRole("list", { name: ACCOUNT_LABELS.sessions })
      .getByRole("listitem");
    await expect(sessions).toHaveCount(2);
    await expect(sessions.filter({ hasText: ACCOUNT_LABELS.thisDevice })).toHaveCount(1);

    await sessions
      .filter({ hasNotText: ACCOUNT_LABELS.thisDevice })
      .getByRole("button", { name: ACCOUNT_LABELS.signOut })
      .click();
    await expect(sessions).toHaveCount(1);

    // The revoked session is gone from the database; the cookie cache may
    // keep a cookie client signed in for up to five minutes, so skip it.
    const revoked = await otherPage.request.get("/api/auth/get-session?disableCookieCache=true");
    expect(await revoked.json()).toBeNull();
  } finally {
    await otherContext.close();
  }
});
