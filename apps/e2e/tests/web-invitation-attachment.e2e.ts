import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

/**
 * Gaps documented intentionally (template CI constraints):
 *
 * - Invitation accept needs a real email delivery path or a seeded invitation
 *   row + matching signed-in user. Soft console email only logs tokens; there
 *   is no members invite UI in the template shell. Recipient binding is covered
 *   by packages/auth invitation security unit tests.
 *
 * - Todo attachment upload requires S3/MinIO (CI only provides Postgres).
 *   Set E2E_STORAGE_ENABLED=1 to run the real storage flow below.
 */
test.describe("invitation and attachment (documented gaps)", () => {
  test.skip(
    true,
    "Invitation happy path needs email adapter + invite UI; see packages/auth invitation-security tests"
  );
});

test("uploads, downloads, and removes a Todo attachment", async ({ page }) => {
  test.skip(process.env.E2E_STORAGE_ENABLED !== "1", "Requires a configured local S3/MinIO bucket");
  await signIn(page);
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const title = `Attachment ${Date.now()}`;
  await page.getByRole("button", { name: "New todo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New todo", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "New todo", exact: true }).click();
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("checkbox", { name: title, exact: true })
  });
  await row.locator("summary").click();
  await row.locator('input[type="file"]').setInputFiles({
    name: "redesign-check.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment round trip")
  });
  await expect(row.getByText("redesign-check.txt", { exact: true })).toBeVisible();
  const downloadUrl = await row
    .getByRole("link", { name: "Download", exact: true })
    .getAttribute("href");
  expect(downloadUrl).toBeTruthy();
  const response = await page.request.get(downloadUrl ?? "");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe("Attachment round trip");
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Remove attachment", exact: true })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(row.getByText("redesign-check.txt", { exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete todo", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});
