import { expect, test, type Locator } from "@playwright/test";

import { signIn } from "./helpers/auth";

test.use({ video: { mode: "on", size: { width: 1440, height: 900 } } });

/** Freeze actual browser animations halfway through, then inspect their geometry. */
async function midpoint(locator: Locator) {
  return locator.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const animations = element.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      const duration = animation.effect?.getComputedTiming().duration;
      if (typeof duration === "number") animation.currentTime = duration / 2;
    }
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      count: animations.length,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      opacity: Number(style.opacity),
      transform: style.transform
    };
  });
}

async function finish(locator: Locator) {
  await locator.evaluate((element) =>
    element.getAnimations({ subtree: true }).forEach((animation) => animation.finish())
  );
}

for (const theme of ["light", "dark"]) {
  test(`sidebar motion interpolates and reverses without overflowing in ${theme}`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await signIn(page);
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme
    );
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const rail = page.locator('[data-slot="sidebar-container"]');
      const gap = page.locator('[data-slot="sidebar-gap"]');
      const initial = await rail.boundingBox();
      const preferences = rail.locator(".ui-sidebar-preferences-footer");
      const footerBefore = await preferences.boundingBox();
      const languageBefore = await preferences
        .getByRole("button", { name: "Language", exact: true })
        .boundingBox();
      const themeBefore = await preferences
        .getByRole("button", { name: "Theme", exact: true })
        .boundingBox();
      await page.locator('[data-slot="sidebar-trigger"]').evaluate((element) => {
        if (element instanceof HTMLElement) element.click();
      });
      const middle = await midpoint(rail);
      const gapMiddle = await midpoint(gap);
      expect(middle.count).toBeGreaterThan(0);
      expect(middle.width).toBeGreaterThan(48);
      expect(middle.width).toBeLessThan(initial?.width ?? 0);
      expect(Math.abs(gapMiddle.width - middle.width)).toBeLessThan(1);
      const footerMiddle = await preferences.boundingBox();
      expect(footerMiddle?.height).toBe(footerBefore?.height);
      expect(footerMiddle?.y).toBe(footerBefore?.y);
      const labelOpacity = await preferences
        .locator(".ui-shell-select-compact__label")
        .first()
        .evaluate((element) => Number(getComputedStyle(element).opacity));
      expect(labelOpacity).toBeGreaterThan(0);
      expect(labelOpacity).toBeLessThan(1);
      for (const label of ["Language", "Theme"]) {
        const box = await rail.getByRole("button", { name: label, exact: true }).boundingBox();
        expect(box).not.toBeNull();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(middle.x + middle.width);
        expect(box?.y).toBe(label === "Language" ? languageBefore?.y : themeBefore?.y);
      }
      await page.locator('[data-slot="sidebar-trigger"]').evaluate((element) => {
        if (element instanceof HTMLElement) element.click();
      });
      await expect.poll(async () => (await rail.boundingBox())?.width).toBe(initial?.width);
    }
  });
}

for (const side of ["left", "right", "top", "bottom"]) {
  test(`Sheet animates both directions from ${side} and restores focus`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/motion.fixture.html?side=${side}`);
    const trigger = page.getByRole("button", { name: "Edit", exact: true });
    await trigger.click();
    const sheet = page.locator(".ui-sheet-content");
    const opening = await midpoint(sheet);
    expect(opening.count).toBeGreaterThan(0);
    expect(opening.transform).not.toBe("none");
    const openingMatrix = await sheet.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { x: matrix.m41, y: matrix.m42 };
    });
    if (side === "left" || side === "top")
      expect(side === "left" ? openingMatrix.x : openingMatrix.y).toBeLessThan(0);
    else expect(side === "right" ? openingMatrix.x : openingMatrix.y).toBeGreaterThan(0);
    await finish(sheet);
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    const closing = await midpoint(sheet);
    expect(closing.count).toBeGreaterThan(0);
    expect(closing.transform).not.toBe("none");
    await finish(sheet);
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test("dialog exits and live reduced motion settle correctly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Add details", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  expect((await midpoint(dialog)).opacity).toBeLessThan(1);
  await finish(dialog);
  await dialog.getByLabel("Title", { exact: true }).fill("Motion draft");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Motion draft");
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await trigger.click();
  await finish(dialog);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  expect((await midpoint(dialog)).opacity).toBeLessThan(1);
  await finish(dialog);
  await expect(dialog).toHaveCount(0);
});

test("Attachment disclosure interpolates and keeps its mounted upload control", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const title = `Attachment motion ${crypto.randomUUID()}`;
  await page.getByRole("textbox", { name: "What needs to be done?", exact: true }).fill(title);
  await page.getByRole("button", { name: "Add Todo", exact: true }).click();
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
  const trigger = row.getByRole("button", { name: /^Attachments/ });
  const content = row.locator(".ui-collapsible");
  const fileInput = content.locator('input[type="file"]');
  await expect(content).toHaveAttribute("inert", "");
  await fileInput.evaluate((element) => element.setAttribute("data-motion-identity", "retained"));
  await trigger.evaluate((element) => {
    if (element instanceof HTMLElement) element.click();
  });
  const middle = await midpoint(content);
  expect(middle.count).toBeGreaterThan(0);
  expect(middle.height).toBeGreaterThan(0);
  await finish(content);
  const expanded = await content.boundingBox();
  expect(middle.height).toBeLessThan(expanded?.height ?? 0);
  await trigger.click();
  await expect(content).toHaveAttribute("inert", "");
  await finish(content);
  await trigger.click();
  await expect(fileInput).toHaveAttribute("data-motion-identity", "retained");
});

test("menus and tooltips animate entry and exit, then follow reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  await page.locator('[data-slot="sidebar-trigger"]').click();
  const theme = page.getByRole("button", { name: "Theme", exact: true });
  await theme.hover();
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  expect((await midpoint(tooltip)).opacity).toBeLessThan(1);
  await finish(tooltip);
  await page.mouse.move(600, 300);
  expect((await midpoint(tooltip)).opacity).toBeLessThan(1);
  await finish(tooltip);
  await theme.click();
  const menu = page.getByRole("menu");
  expect((await midpoint(menu)).opacity).toBeLessThan(1);
  await finish(menu);
  await page.keyboard.press("Escape");
  expect((await midpoint(menu)).opacity).toBeLessThan(1);
  await finish(menu);
  await expect(theme).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await theme.click();
  const duration = await menu.evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.001);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(theme).toBeFocused();
});

test.describe("motion review captures", () => {
  for (const theme of ["light", "dark"]) {
    test(`calm motion at phone, tablet, and desktop sizes in ${theme}`, async ({
      page
    }, testInfo) => {
      const hostReduced = await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches
      );
      await testInfo.attach("browser-default-motion", {
        body: `prefers-reduced-motion: ${hostReduced ? "reduce" : "no-preference"}`,
        contentType: "text/plain"
      });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await signIn(page);
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      await page
        .getByRole("menuitemradio", { name: theme === "light" ? "Light" : "Dark", exact: true })
        .click();
      await page.getByRole("button", { name: "Language", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "Deutsch", exact: true }).click();
      for (const width of [360, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const trigger = page.locator('[data-slot="sidebar-trigger"]');
        await trigger.click();
        if (width === 360) {
          const drawer = page.locator(".ui-sheet-content");
          await expect(drawer).toBeVisible();
          await drawer.evaluate(async (element) => {
            await Promise.all(element.getAnimations().map((animation) => animation.finished));
          });
          await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`) });
          await page.keyboard.press("Escape");
          await expect(drawer).toHaveCount(0);
        } else {
          const rail = page.locator('[data-slot="sidebar-container"]');
          await expect.poll(async () => (await rail.boundingBox())?.width).toBe(48);
          await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`) });
          await trigger.click();
          await expect.poll(async () => (await rail.boundingBox())?.width).toBe(256);
          await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-expanded.png`) });
        }
      }
      await page.getByRole("button", { name: "Sprache", exact: true }).click();
      await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
      await page.getByRole("link", { name: "Todos", exact: true }).click();
      await page.getByRole("button", { name: "Add details", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Motion preview");
      await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
      await expect(dialog).toHaveCount(0);
    });
  }
});
