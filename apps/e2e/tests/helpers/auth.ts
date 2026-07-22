import { expect, type Page } from "@playwright/test";

/** Seeded credential user from packages/db seed. */
export const SEEDED_USER = {
  email: "test@test.test",
  password: "ChangeMe123!"
} as const;

/** i18n-tolerant labels (en key or translated string). */
export const AUTH_LABELS = {
  login: /^(Sign in|auth\.login\.title)$/,
  signup: /^(Create account|auth\.signup\.title)$/,
  email: /^(Email|common\.emailLabel)$/,
  password: /^(Password|common\.passwordLabel)$/,
  confirmPassword: /^(Confirm password|common\.confirmPasswordLabel)$/,
  name: /^(Full name|common\.nameLabel)$/,
  logout: /^(Log out|auth\.logout)$/
} as const;

export const NAV_LABELS = {
  todos: /^(Todos|navigation\.todos)$/,
  organization: /^(Organization|navigation\.organization)$/,
  organizationCreate: /^(Create organization|navigation\.organizationCreate)$/
} as const;

export async function signIn(
  page: Page,
  credentials: { email: string; password: string } = SEEDED_USER
): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(AUTH_LABELS.email).fill(credentials.email);
  await page.getByLabel(AUTH_LABELS.password).fill(credentials.password);
  await page.locator("form").getByRole("button", { name: AUTH_LABELS.login }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
