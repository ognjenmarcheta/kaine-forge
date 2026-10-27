import { expect, test } from "@playwright/test";

const TERMS_TITLE = /^(Terms of Service|legal\.terms\.title)$/;
const PRIVACY_TITLE = /^(Privacy Policy|legal\.privacy\.title)$/;
const APP_NAME = "(Kaine Forge|common\\.appName)";

test("a signed-out visitor opens the terms page from the auth footer with the keyboard", async ({
  page
}) => {
  await page.goto("/auth");
  await expect(page).toHaveTitle(new RegExp(`^(Sign in|auth\\.login\\.title) · ${APP_NAME}$`));

  const terms = page.getByRole("link", { name: TERMS_TITLE });
  await expect(page.getByRole("link", { name: PRIVACY_TITLE })).toBeVisible();

  // Reach the link by keyboard so :focus-visible applies, then check the outline.
  await page.getByRole("link", { name: PRIVACY_TITLE }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(terms).toBeFocused();
  expect(await terms.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none"
  );

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: TERMS_TITLE })).toBeVisible();
  await expect(page).toHaveTitle(
    new RegExp(`^(Terms of Service|legal\\.terms\\.title) · ${APP_NAME}$`)
  );
});

test("serves robots.txt without a sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");

  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("User-agent: *");
  expect(body).not.toMatch(/sitemap/i);
});
