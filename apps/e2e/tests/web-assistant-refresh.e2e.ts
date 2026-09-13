import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { mockAssistant, openAssistantHistory } from "./helpers/assistant";

async function openRelease(page: Page) {
  await openAssistantHistory(page);
  await page.getByRole("button", { name: /^Release plan/ }).click();
  await expect(
    page.getByText("I created a Note for the release plan.", { exact: false }).last()
  ).toBeVisible();
}
async function fitsViewport(page: Page) {
  const input = await page.getByRole("textbox").boundingBox();
  const send = await page.locator('.ui-assistant__composer button[type="submit"]').boundingBox();
  expect(input).not.toBeNull();
  expect(send).not.toBeNull();
  expect(send ? send.y + send.height : Infinity).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  ).toBe(true);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 768, 1024, 1440]) {
    test(`assistant states at ${width.toString()}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const fixture = await mockAssistant(page);
      await page.goto("/assistant");
      await expect(
        page.getByRole("heading", { name: "What would you like to get done?" })
      ).toBeVisible();
      await fitsViewport(page);
      const sendButton = page.getByRole("button", { name: "Send", exact: true });
      const disabledBackground = await sendButton.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      );
      await sendButton.hover();
      await expect
        .poll(() => sendButton.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(disabledBackground);
      await page.screenshot({ path: testInfo.outputPath("empty.png") });
      await openRelease(page);
      await expect(page.getByRole("link", { name: "Open Note", exact: true })).toHaveAttribute(
        "href",
        /\/notes\//
      );
      await fitsViewport(page);
      await page.screenshot({ path: testInfo.outputPath("populated.png") });
      const accessibility = await new AxeBuilder({ page }).include(".ui-assistant").analyze();
      expect(accessibility.violations).toEqual([]);
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Create a planning Note with a checklist");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".ui-assistant__status")).toHaveText("Thinking…");
      fixture.delta("Preparing your planning Note…");
      await expect(page.locator(".ui-assistant__status")).toHaveText("Responding…");
      await page.screenshot({ path: testInfo.outputPath("streaming.png") });
      fixture.state.fail = true;
      fixture.finish();
      await expect(
        page.getByRole("alert").getByText("The assistant could not complete your request.")
      ).toBeVisible();
      await fitsViewport(page);
      await page.screenshot({ path: testInfo.outputPath("failed.png") });
      for (const state of ["empty", "populated", "streaming", "failed"]) {
        await testInfo.attach(`${state}-${width.toString()}-${theme}`, {
          path: testInfo.outputPath(`${state}.png`),
          contentType: "image/png"
        });
      }
    });
  }
}

test("starters focus the composer and streamed navigation preserves drafts", async ({ page }) => {
  const fixture = await mockAssistant(page);
  await page.goto("/assistant");
  await page
    .getByRole("button", { name: "Create a planning Note with a checklist", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(input).toBeFocused();
  expect(fixture.state.sends).toBe(0);
  await input.press("Enter");
  await expect(page.locator(".ui-assistant__status")).toHaveText("Thinking…");
  await input.fill("Follow-up draft");
  await openAssistantHistory(page);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await input.fill("Different draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Return to conversation" }).click();
  await expect(input).toHaveValue("Follow-up draft");
  fixture.delta("Preparing your planning Note…");
  await expect(page.getByText("Preparing your planning Note…")).toBeVisible();
  await openAssistantHistory(page);
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  fixture.finish();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(input).toHaveValue("Different draft");
  await openRelease(page);
  await expect(page.getByText("Your planning Note is ready.")).toBeVisible();
  await expect(input).toHaveValue("Follow-up draft");
});

test("history Sheet restores focus and deletion requires confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockAssistant(page);
  await page.goto("/assistant");
  const history = page.getByRole("button", { name: "Conversations", exact: true });
  await history.click();
  await page.keyboard.press("Escape");
  await expect(history).toBeFocused();
  await history.click();
  await page.getByRole("button", { name: "Conversation options: Release plan" }).click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await expect(page.getByText("Delete this conversation and its messages?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Release plan/ })).toBeVisible();
  await page.getByRole("button", { name: "Conversation options: Release plan" }).click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Release plan/ })).toHaveCount(0);
});

test("reading older messages does not follow incoming text until Jump to latest", async ({
  page
}) => {
  const fixture = await mockAssistant(page);
  fixture.state.long = true;
  await page.goto("/assistant");
  await openRelease(page);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Plan");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const viewport = page.locator(".ui-assistant__messages");
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  fixture.delta("A new response");
  await expect(page.getByText("A new response", { exact: true })).toHaveCount(1);
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Jump to latest" }).click();
  await expect(page.getByText("A new response")).toBeVisible();
  fixture.finish();
});

for (const language of ["de", "sr"]) {
  test(`short viewport keeps the ${language} composer usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.addInitScript((lang) => localStorage.setItem("kaine.language", lang), language);
    await mockAssistant(page);
    await page.goto("/assistant");
    await expect(page.locator("#assistant-message")).toBeVisible();
    await fitsViewport(page);
    await page.locator("#assistant-message").fill("Long draft ".repeat(100));
    await fitsViewport(page);
    await page.screenshot({ path: testInfo.outputPath(`short-${language}.png`) });
    await testInfo.attach(`short-${language}`, {
      path: testInfo.outputPath(`short-${language}.png`),
      contentType: "image/png"
    });
  });
}
