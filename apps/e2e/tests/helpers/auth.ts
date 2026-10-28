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
  notes: /^(Notes|navigation\.notes)$/,
  // Named by its visible text: "<organization name> Organization" (#545).
  organization: /(Organization|navigation\.organization)$/,
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

export const ONBOARDING_LABELS = {
  nameTitle: /^(Name your organization|auth\.onboarding\.organization\.title)$/,
  inviteTitle: /^(Invite your team|auth\.onboarding\.invite\.title)$/,
  rename: /^(Save and continue|auth\.onboarding\.organization\.rename)$/,
  skip: /^(Skip for now|auth\.onboarding\.skip)$/
} as const;

/** Submit the sign-up form; a new account lands on the first-run onboarding. */
export async function submitSignUp(
  page: Page,
  account: { email: string; name: string; password: string }
): Promise<void> {
  // The mode switcher is a link; the form's submit is the only "Create account" button.
  await page.getByRole("link", { name: AUTH_LABELS.signup }).click();
  await page.getByLabel(AUTH_LABELS.name).fill(account.name);
  await page.getByLabel(AUTH_LABELS.email).fill(account.email);
  await page.getByLabel(AUTH_LABELS.password).fill(account.password);
  await page.getByLabel(AUTH_LABELS.confirmPassword).fill(account.password);
  await page.locator("form").getByRole("button", { name: AUTH_LABELS.signup }).click();
}

/** Skip the first-run onboarding and land on the dashboard. */
export async function skipOnboarding(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: ONBOARDING_LABELS.skip }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Register a new account, skip onboarding, and land on the dashboard. */
export async function signUp(
  page: Page,
  account: { email: string; name: string; password: string }
): Promise<void> {
  await page.goto("/auth");
  await submitSignUp(page, account);
  await skipOnboarding(page);
}

/**
 * Same-origin better-auth call under /api/auth, with the page's session cookie.
 * The request context sends no Origin header by itself and better-auth's CSRF
 * check rejects that (MISSING_OR_NULL_ORIGIN), so send the page's own origin,
 * as the browser would. Returns the parsed JSON body as an object.
 */
export async function authApi(
  page: Page,
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await page.request.post(`/api/auth/${path}`, {
    data: body,
    headers: { origin: new URL(page.url()).origin }
  });
  expect(response.ok(), `${path} HTTP ${String(response.status())}: ${await response.text()}`).toBe(
    true
  );
  const payload: unknown = await response.json();
  if (!isObject(payload)) {
    throw new Error(`${path} did not return an object`);
  }
  return payload;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
