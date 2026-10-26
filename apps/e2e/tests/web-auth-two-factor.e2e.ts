import { expect, test } from "@playwright/test";

import { AUTH_LABELS, NAV_LABELS, signUp } from "./helpers/auth";
import { generateTotp } from "./helpers/totp";

const SECURITY_LABELS = {
  enable: /^(Turn on two-step verification|auth\.security\.enable)$/,
  passwordPrompt: /^(Enter your password to continue\.|auth\.security\.passwordPrompt)$/,
  continue: /^(Continue|auth\.security\.continue)$/,
  verifyCode:
    /^(Enter the 6-digit code from the app to finish setup\.|auth\.security\.verifyCode)$/,
  confirm: /^(Confirm|auth\.security\.confirm)$/,
  done: /^(Done|auth\.security\.done)$/,
  backupCodes: /^(Backup codes|auth\.security\.backupCodesTitle)$/,
  enabled: /(Two-step verification is on\.|auth\.security\.statusEnabled)/
} as const;

const TWO_FACTOR_LABELS = {
  backupMethod: /^(Backup code|auth\.twoFactor\.method\.backup)$/,
  code: /^(Code|auth\.otp\.codeLabel)$/,
  verify: /^(Verify|auth\.twoFactor\.verify)$/
} as const;

test("enrolls TOTP two-factor and requires a second factor on the next sign-in", async ({
  page
}) => {
  const uniqueSuffix = Date.now().toString(36);
  const account = {
    email: `e2e-2fa-${uniqueSuffix}@test.test`,
    name: `E2E 2FA ${uniqueSuffix}`,
    password: `E2e-${uniqueSuffix}-Pass!`
  } as const;

  await signUp(page, account);

  // Enroll: confirm the password, read the setup key, prove the app is linked.
  await page.getByRole("link", { name: NAV_LABELS.security }).click();
  await page.getByRole("button", { name: SECURITY_LABELS.enable }).click();
  await page.getByLabel(SECURITY_LABELS.passwordPrompt).fill(account.password);
  await page.getByRole("button", { name: SECURITY_LABELS.continue }).click();
  const setupKey = (await page.locator("code").textContent())?.trim() ?? "";
  expect(setupKey).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel(SECURITY_LABELS.verifyCode).fill(generateTotp(setupKey));
  await page.getByRole("button", { name: SECURITY_LABELS.confirm }).click();

  // Backup codes are shown once; keep one for the sign-in below.
  const backupCode =
    (
      await page
        .getByRole("list", { name: SECURITY_LABELS.backupCodes })
        .getByRole("listitem")
        .first()
        .textContent()
    )?.trim() ?? "";
  expect(backupCode.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: SECURITY_LABELS.done }).click();
  await expect(page.getByText(SECURITY_LABELS.enabled)).toBeVisible();

  await page.getByRole("button", { name: account.name }).click();
  await page.getByRole("menuitem", { name: AUTH_LABELS.logout }).click();
  await expect(page).toHaveURL(/\/auth$/);

  // The password alone no longer signs in; a backup code completes it.
  await page.getByLabel(AUTH_LABELS.email).fill(account.email);
  await page.getByLabel(AUTH_LABELS.password).fill(account.password);
  await page.locator("form").getByRole("button", { name: AUTH_LABELS.login }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.getByRole("button", { name: TWO_FACTOR_LABELS.backupMethod }).click();
  await page.getByLabel(TWO_FACTOR_LABELS.code).fill(backupCode);
  await page.getByRole("button", { name: TWO_FACTOR_LABELS.verify }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
