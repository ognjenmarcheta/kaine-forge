import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

test("footer choices preserve drafts and restore focus across collapse and reload", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  const composer = page.locator("#assistant-message");
  await composer.fill("Preferences must preserve this draft");
  const footer = page.locator(".ui-sidebar-preferences-footer");
  const language = footer.getByRole("button", { name: "Language", exact: true });
  await expect(language).toContainText("English");
  await language.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveAttribute("data-side", "top");
  await expect(page.getByRole("menuitemradio", { name: "English", exact: true })).toBeChecked();
  await expect(page.getByRole("menuitemradio")).toHaveText(["English", "Srpski", "Deutsch"]);
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitemradio", { name: "Deutsch", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const germanLanguage = footer.getByRole("button", { name: "Sprache", exact: true });
  await expect(germanLanguage).toContainText("Deutsch");
  await expect(germanLanguage).toBeFocused();
  await expect(composer).toHaveValue("Preferences must preserve this draft");
  const theme = footer.getByRole("button", { name: "Design", exact: true });
  await theme.click();
  await page.getByRole("menuitemradio", { name: "Dunkel", exact: true }).click();
  await expect(theme).toBeFocused();
  await expect(composer).toHaveValue("Preferences must preserve this draft");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.locator('[data-slot="sidebar-trigger"]').click();
  await expect
    .poll(async () => (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width)
    .toBe(48);
  await germanLanguage.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Sprache: Deutsch");
  await germanLanguage.click();
  await expect(page.getByRole("menu")).toHaveAttribute("data-side", "right");
  await page.keyboard.press("Escape");
  await expect(germanLanguage).toBeFocused();

  // A live preference change must settle any expansion without resetting content.
  await page.locator('[data-slot="sidebar-trigger"]').evaluate((element) => {
    if (element instanceof HTMLElement) element.click();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () => (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width)
    .toBe(256);
  expect(await footer.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(
    0
  );
  await expect(composer).toHaveValue("Preferences must preserve this draft");
  await page.reload();
  await expect(footer.getByRole("button", { name: "Sprache", exact: true })).toContainText(
    "Deutsch"
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("responsive drawer keeps labeled preferences usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  await page.locator('[data-slot="sidebar-trigger"]').click();
  const footer = page.locator(".ui-sidebar-preferences-footer");
  for (const label of ["Language", "Theme"]) {
    const control = footer.getByRole("button", { name: label, exact: true });
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    await expect(control).toContainText(label);
  }
  const theme = footer.getByRole("button", { name: "Theme", exact: true });
  await theme.click();
  await expect(page.getByRole("menuitemradio", { name: "System", exact: true })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(theme).toBeFocused();
  await expect(page.locator(".ui-sheet-content")).toBeVisible();
  await theme.click();
  await page.keyboard.press("Escape");
  await expect(theme).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ui-sheet-content")).toHaveCount(0);
  await expect(page.locator('[data-slot="sidebar-trigger"]')).toBeFocused();
});
