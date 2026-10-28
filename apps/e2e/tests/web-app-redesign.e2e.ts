import { expect, test } from "@playwright/test";

import { signIn, signUp } from "./helpers/auth";

test("the dashboard's open todos count follows a todo added from the dashboard", async ({
  page
}) => {
  // A new account has its own personal organization, so its counts start at zero.
  const suffix = Date.now().toString(36);
  await signUp(page, {
    email: `e2e-dashboard-${suffix}@test.test`,
    name: `E2E Dashboard ${suffix}`,
    password: `E2e-${suffix}-Pass!`
  });
  const openTodos = page.getByRole("link", { name: /^Open todos\s*\d+$/ });
  await expect(openTodos).toHaveAccessibleName(/^Open todos\s*0$/);

  const title = `Dashboard todo ${suffix}`;
  await page.getByLabel("What needs to be done?", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add Todo", exact: true }).click();

  await expect(page.getByRole("checkbox", { name: title, exact: true })).toBeVisible();
  await expect(openTodos).toHaveAccessibleName(/^Open todos\s*1$/);
});

test("a settings tab keeps its URL and selection across a reload", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await expect(page).toHaveURL(/\/organization\/general$/);

  const tabs = page.getByRole("navigation", { name: "Organization settings", exact: true });
  await tabs.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/organization\/members$/);

  await page.reload();
  await expect(page).toHaveURL(/\/organization\/members$/);
  await expect(tabs.getByRole("link", { name: "Members", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(tabs.getByRole("link", { name: "General", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("Ctrl+K opens the command menu and Enter goes to the matching page", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("Control+k");
  const menu = page.getByRole("dialog", { name: "Command menu", exact: true });
  await expect(menu).toBeVisible();

  await page.keyboard.type("todos");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/todos$/);
  await expect(menu).toHaveCount(0);
});
