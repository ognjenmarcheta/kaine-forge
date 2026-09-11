import { expect, test } from "@playwright/test";

import { AUTH_LABELS, NAV_LABELS, signIn } from "./helpers/auth";

const TODOS_CREATE_NAME = /^(New todo|todos\.create)$/;
const TODOS_TITLE_LABEL = /^(Title|todos\.form\.titlePlaceholder)$/;
const TODOS_DESCRIPTION_LABEL = /^(Description|todos\.form\.descriptionPlaceholder)$/;
const TODOS_DELETE_CONFIRM_NAME = /^(Delete todo|todos\.deleteConfirmTitle)$/;
const BUTTON_DELETE_NAME = /^(Delete|button\.delete)$/;

test("registers a new account, signs out, and signs back in", async ({ page }) => {
  const uniqueSuffix = Date.now().toString(36);
  const account = {
    email: `e2e-${uniqueSuffix}@test.test`,
    name: `E2E User ${uniqueSuffix}`,
    password: "ChangeMe123!"
  } as const;

  await page.goto("/auth");
  // In login mode the only "Create account" button is the mode switcher.
  await page.getByRole("button", { name: AUTH_LABELS.signup }).click();

  await page.getByLabel(AUTH_LABELS.name).fill(account.name);
  await page.getByLabel(AUTH_LABELS.email).fill(account.email);
  await page.getByLabel(AUTH_LABELS.password).fill(account.password);
  await page.getByLabel(AUTH_LABELS.confirmPassword).fill(account.password);
  await page.locator("form").getByRole("button", { name: AUTH_LABELS.signup }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Sign out through the user menu; the trigger is named after the user.
  await page.getByRole("button", { name: account.name }).click();
  await page.getByRole("menuitem", { name: AUTH_LABELS.logout }).click();
  await expect(page).toHaveURL(/\/auth$/);

  // The new credentials round-trip through a real login.
  await page.getByLabel(AUTH_LABELS.email).fill(account.email);
  await page.getByLabel(AUTH_LABELS.password).fill(account.password);
  await page.locator("form").getByRole("button", { name: AUTH_LABELS.login }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("creates, edits, completes, and deletes a todo", async ({ page }) => {
  const todoTitle = `E2E todo ${Date.now().toString(36)}`;

  await signIn(page);
  await page.getByRole("link", { name: NAV_LABELS.todos }).click();
  await expect(page).toHaveURL(/\/todos$/);

  // Create.
  await page.getByRole("button", { name: TODOS_CREATE_NAME }).click();
  const createDialog = page.getByRole("dialog", { name: TODOS_CREATE_NAME });
  await createDialog.getByLabel(TODOS_TITLE_LABEL).fill(todoTitle);
  await createDialog.getByLabel(TODOS_DESCRIPTION_LABEL).fill("Created by the behavioral e2e spec");
  await createDialog.getByRole("button", { name: TODOS_CREATE_NAME }).click();

  const todoCheckbox = page.getByRole("checkbox", { name: todoTitle });
  await expect(todoCheckbox).toHaveCount(1);
  await expect(todoCheckbox).not.toBeChecked();

  const row = page.getByRole("listitem").filter({ has: todoCheckbox });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit todo", exact: true });
  await editDialog.getByLabel(TODOS_DESCRIPTION_LABEL).fill("Updated description");
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("Updated description", { exact: true })).toBeVisible();

  // Complete, then prove the server persisted it (not just optimistic UI).
  await todoCheckbox.click();
  await expect(todoCheckbox).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: todoTitle })).toBeChecked();
  await expect(row.getByText("Updated description", { exact: true })).toBeVisible();

  // Delete through the row action plus the confirm dialog.
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("checkbox", { name: todoTitle }) })
    .getByRole("button", { name: BUTTON_DELETE_NAME })
    .click();
  const confirmDialog = page.getByRole("dialog", { name: TODOS_DELETE_CONFIRM_NAME });
  await confirmDialog.getByRole("button", { name: BUTTON_DELETE_NAME }).click();

  await expect(page.getByRole("checkbox", { name: todoTitle })).toHaveCount(0);
});
