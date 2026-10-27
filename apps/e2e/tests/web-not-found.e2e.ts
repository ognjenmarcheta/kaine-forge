import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

const NOT_FOUND_TITLE = /^(Page not found|notFound\.title)$/;
const NOT_FOUND_DOCUMENT_TITLE =
  /^(Page not found|notFound\.title) · (Kaine Forge|common\.appName)$/;
const GO_TO_DASHBOARD = /^(Go to dashboard|common\.goToDashboard)$/;

test("shows the not-found page for an unknown path and links back to the dashboard", async ({
  page
}) => {
  await signIn(page);
  await page.goto("/no-such-page");

  await expect(page).toHaveURL(/\/no-such-page$/);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND_TITLE })).toBeVisible();
  await expect(page).toHaveTitle(NOT_FOUND_DOCUMENT_TITLE);

  await page.getByRole("link", { name: GO_TO_DASHBOARD }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
