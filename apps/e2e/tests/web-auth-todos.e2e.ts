import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SEEDED_USER = {
  email: "test@test.test",
  password: "ChangeMe123!"
} as const;

const AUTH_LOGIN_NAME = /^(Sign in|auth\.login\.title)$/;
const AUTH_EMAIL_LABEL = /^(Email|common\.emailLabel)$/;
const AUTH_PASSWORD_LABEL = /^(Password|common\.passwordLabel)$/;
const DASHBOARD_TITLE = /^(Overview|dashboard\.title)$/;
const NAV_TODOS = /^(Todos|navigation\.todos)$/;
const TODOS_TITLE = /^(Todos|todos\.title)$/;
const TODOS_CREATE = /^(New todo|todos\.create)$/;
const TODO_TITLE_LABEL = /^(Title|todos\.form\.titlePlaceholder)$/;
const TODO_DESCRIPTION_LABEL = /^(Description|todos\.form\.descriptionPlaceholder)$/;
const TODO_DELETE = /^(Delete|button\.delete)$/;
const TODO_DELETE_CONFIRM_TITLE = /^(Delete todo|todos\.deleteConfirmTitle)$/;

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

test("sign in and complete todo lifecycle", async ({ page }) => {
  await signIn(page);

  await expect(page.getByRole("heading", { name: DASHBOARD_TITLE, level: 1 })).toBeVisible();

  await page.getByRole("link", { name: NAV_TODOS }).click();
  await expect(page).toHaveURL(/\/todos$/);
  await expect(page.getByRole("heading", { name: TODOS_TITLE, level: 1 })).toBeVisible();

  const todoTitle = `e2e todo ${Date.now().toString()}`;

  await page.getByRole("button", { name: TODOS_CREATE }).click();
  await page.getByLabel(TODO_TITLE_LABEL).fill(todoTitle);
  await page.getByLabel(TODO_DESCRIPTION_LABEL).fill("created by playwright");
  await page
    .getByRole("dialog", { name: TODOS_CREATE })
    .getByRole("button", { name: TODOS_CREATE })
    .click();

  await expect(page.getByText(todoTitle)).toBeVisible();

  const todoRow = page.locator("li", { hasText: todoTitle });
  const todoCheckbox = todoRow.getByRole("checkbox");
  await todoCheckbox.click();
  await expect(todoRow.getByRole("checkbox")).toBeChecked();

  await todoRow.getByRole("button", { name: TODO_DELETE }).click();
  const confirmDialog = page.getByRole("dialog", { name: TODO_DELETE_CONFIRM_TITLE });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: TODO_DELETE }).click();
  await expect(confirmDialog).not.toBeVisible();

  await expect(page.locator("li", { hasText: todoTitle })).toHaveCount(0);
});

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
