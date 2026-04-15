import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SEEDED_USER = {
  email: "test@test.test",
  password: "ChangeMe123!"
} as const;

const AUTH_LOGIN_NAME = /^(Sign in|auth\.login\.title)$/;
const AUTH_EMAIL_LABEL = /^(Email|common\.emailLabel)$/;
const AUTH_PASSWORD_LABEL = /^(Password|common\.passwordLabel)$/;
const NAV_TODOS = /^(Todos|navigation\.todos)$/;

async function signIn(page: Page): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(AUTH_EMAIL_LABEL).fill(SEEDED_USER.email);
  await page.getByLabel(AUTH_PASSWORD_LABEL).fill(SEEDED_USER.password);
  await page.locator("form").getByRole("button", { name: AUTH_LOGIN_NAME }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

function blockingA11yViolations(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );
}

test("has no critical or serious a11y violations on core pages", async ({ page }) => {
  await page.goto("/auth");
  const authResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(authResults)).toEqual([]);

  await signIn(page);
  const dashboardResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(dashboardResults)).toEqual([]);

  await page.getByRole("link", { name: NAV_TODOS }).click();
  const todosResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(todosResults)).toEqual([]);
});
