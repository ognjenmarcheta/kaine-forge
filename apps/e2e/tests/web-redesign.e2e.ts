import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

test("collapsed sidebar keeps preference controls inside the rail", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const theme = sidebar.getByRole("button", { name: "Theme", exact: true });
  const language = sidebar.getByRole("button", { name: "Language", exact: true });
  const trigger = page.locator('[data-slot="sidebar-trigger"]');
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.click();
    await expect(page.locator('[data-slot="sidebar"][data-state="collapsed"]')).toBeVisible();
    await expect(sidebar.locator('.ui-sidebar-user [data-slot="avatar"]')).toHaveCSS(
      "opacity",
      "1"
    );
    for (const mode of ["Light", "Dark"]) {
      for (const control of [language, theme]) {
        await expect(control).toHaveCSS("width", "32px");
        const railBox = await sidebar.boundingBox();
        const controlBox = await control.boundingBox();
        if (!railBox || !controlBox) throw new Error("Sidebar controls must be visible");
        expect(controlBox.x).toBeGreaterThanOrEqual(railBox.x);
        expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(railBox.x + railBox.width);
        const icon = control.locator(":scope > svg").first();
        await expect(icon).toHaveCSS("opacity", "1");
        const iconBox = await icon.boundingBox();
        if (!iconBox) throw new Error("Preference icon must remain visible");
        expect(iconBox.width).toBeGreaterThan(0);
        expect(iconBox.x).toBeGreaterThanOrEqual(controlBox.x);
        expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(controlBox.x + controlBox.width);
        await control.click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        await expect
          .poll(async () => (await menu.boundingBox())?.x ?? -1)
          .toBeGreaterThanOrEqual(controlBox.x + controlBox.width);
        await page.keyboard.press("Escape");
        await expect(control).toBeFocused();
      }
      const languageBox = await language.boundingBox();
      const themeBox = await theme.boundingBox();
      if (!languageBox || !themeBox) throw new Error("Preference controls must be visible");
      expect(themeBox.y).toBeGreaterThanOrEqual(languageBox.y + languageBox.height);
      await theme.click();
      await page.getByRole("menuitemradio", { name: mode, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode.toLowerCase());
      await page.screenshot({ path: testInfo.outputPath(`sidebar-${width}-${mode}.png`) });
    }
    await trigger.click();
    await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toBeVisible();
    await expect
      .poll(async () => {
        const languageBox = await language.boundingBox();
        const themeBox = await theme.boundingBox();
        return languageBox && themeBox ? languageBox.x - themeBox.x : null;
      })
      .toBe(0);
  }
});

test("theme follows system changes and persists an explicit choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("combobox", { name: "Theme", exact: true }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("failed Todo submission preserves the open form and its draft", async ({ page }) => {
  await signIn(page);
  await page.goto("/todos");
  await page.getByRole("button", { name: "New todo", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New todo", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill("Retain this draft");
  await dialog.getByLabel("Description", { exact: true }).fill("Even after a failed request");
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation CreateTodo")) {
      await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "New todo", exact: true }).click();
  await expect(dialog.getByText("Something went wrong", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Retain this draft");
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "Even after a failed request"
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "New todo", exact: true })).toBeFocused();
});

test("Note drafts survive theme changes and failed saves", async ({ page }) => {
  await signIn(page);
  await page.goto("/notes");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Redesign ${Date.now()}`);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/.+/);
  await page.locator("#note-body").fill("Unsaved work");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("#note-body")).toHaveValue("Unsaved work");
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation UpdateNote")) {
      await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Something went wrong", { exact: true })).toBeVisible();
  await expect(page.locator("#note-body")).toHaveValue("Unsaved work");
  await page.unroute("**/graphql");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#note-body")).toHaveValue("Unsaved work");
});

test("failed Assistant requests restore the composer draft", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation SendMessage")) {
      await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
    } else await route.continue();
  });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Keep my request");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
    "Keep my request"
  );
  await expect(page.getByText("The assistant could not complete your request.")).toBeVisible();
});

test("Assistant history retries and preserves the reader's scroll position", async ({ page }) => {
  await signIn(page);
  let historyAvailable = false;
  await page.route("**/graphql", async (route) => {
    const query = route.request().postData() ?? "";
    if (query.includes("query GetConversations(")) {
      await route.fulfill({
        json: {
          data: {
            conversations: [
              {
                id: "history-check",
                title: "History check",
                updatedAt: new Date().toISOString()
              }
            ]
          }
        }
      });
    } else if (query.includes("query GetConversation(")) {
      await route.fulfill({
        json: historyAvailable
          ? {
              data: {
                assistantMessages: Array.from({ length: 30 }, (_, index) => ({
                  id: String(index),
                  conversationId: "history-check",
                  role: "assistant",
                  content: `History message ${index}\n${"A line of conversation.\n".repeat(6)}`,
                  createdAt: new Date().toISOString(),
                  toolActions: []
                }))
              }
            }
          : { errors: [{ message: "Unavailable" }] }
      });
    } else if (query.includes("mutation SendMessage")) {
      await route.fulfill({
        json: {
          data: {
            sendMessage: {
              status: "REPLIED",
              conversationId: "history-check",
              reply: "New reply",
              message: null,
              toolActions: []
            }
          }
        }
      });
    } else await route.continue();
  });
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await page.getByRole("button", { name: "History check", exact: true }).click();
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await expect(retry).toBeVisible();
  historyAvailable = true;
  await retry.click();
  const messages = page.locator(".ui-assistant__messages");
  await expect(messages.getByRole("listitem")).toHaveCount(30);
  await messages.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => messages.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("More context");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(messages.getByText("New reply", { exact: true })).toHaveCount(1);
  expect(await messages.evaluate((element) => element.scrollTop)).toBe(0);
  await messages.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("Continue");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(messages.getByText("New reply", { exact: true })).toHaveCount(2);
  await expect
    .poll(() =>
      messages.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight
      )
    )
    .toBeLessThan(2);
});

test("deleting a conversation requires confirmation", async ({ page }) => {
  await signIn(page);
  let deleted = false;
  await page.route("**/graphql", async (route) => {
    const query = route.request().postData() ?? "";
    if (query.includes("query GetConversations")) {
      await route.fulfill({
        json: {
          data: {
            conversations: deleted
              ? []
              : [
                  {
                    id: "preview-conversation",
                    title: "Review conversation",
                    updatedAt: new Date().toISOString()
                  }
                ]
          }
        }
      });
    } else if (query.includes("mutation DeleteConversation")) {
      deleted = true;
      await route.fulfill({ json: { data: { deleteConversation: true } } });
    } else await route.continue();
  });
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  await page.getByRole("button", { name: "Delete chat", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete chat", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(deleted).toBe(false);
  await expect(
    page.getByRole("button", { name: "Review conversation", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete chat", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review conversation", exact: true })).toHaveCount(
    0
  );
  expect(deleted).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  test(`screens fit narrow and wide layouts in ${theme} theme`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await signIn(page);
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["dashboard", "todos", "notes", "assistant", "members"]) {
        if (width < 768)
          await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
        await page.getByRole("link", { name: new RegExp("^" + route + "$", "i") }).click();
        if (width < 768) await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator(".ui-app-shell h1")).toBeVisible();
        await expect(page).toHaveURL(new RegExp("/" + route + "$"));
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
          )
          .toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${route}-${width}-${theme}.png`),
          fullPage: true
        });
        if (width === 1440) {
          const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(
            result.violations.filter(
              (violation) => violation.impact === "critical" || violation.impact === "serious"
            )
          ).toEqual([]);
        }
      }
    }
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/assistant");
    await page.getByRole("button", { name: "Conversations", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const duration = await dialog.evaluate(
      (element) => getComputedStyle(element).animationDuration
    );
    expect(Number.parseFloat(duration)).toBeLessThan(0.001);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Conversations", exact: true })).toBeFocused();
  });
}
