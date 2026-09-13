import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

const NOTES_NAV = /^(Notes|navigation\.notes)$/;
const NOTES_CREATE = /^(New note|notes\.create)$/;

test("creates a note and lists it", async ({ page }) => {
  const noteTitle = `E2E note ${Date.now().toString(36)}`;

  await signIn(page);
  await page.getByRole("link", { name: NOTES_NAV }).click();
  await expect(page).toHaveURL(/\/notes$/);

  await page.getByRole("button", { name: NOTES_CREATE }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(noteTitle);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).not.toHaveURL(/\/notes\/new$/);

  // The saved note has a reloadable detail URL.
  await expect(page).toHaveURL(/\/notes\/.+/);

  await page.getByRole("link", { name: NOTES_NAV }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByText(noteTitle)).toBeVisible();
});
