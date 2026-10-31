import { expect, test } from "@playwright/test";

import { signIn, NAV_LABELS } from "./helpers/auth";

test("Organization menus scroll within a short viewport", async ({ page }) => {
  // The menu must overflow whatever Organizations earlier specs created, so the
  // list always carries extra entries after the user's real ones.
  await page.route("**/api/auth/organization/list*", async (route) => {
    const response = await route.fetch();
    const organizations: unknown = await response.json();
    const extra = Array.from({ length: 6 }, (_, index) => ({
      id: `menu-overflow-${index}`,
      name: `Overflow Organization ${index + 1}`,
      slug: `menu-overflow-${index}`
    }));
    await route.fulfill({
      response,
      json: [...(Array.isArray(organizations) ? organizations : []), ...extra]
    });
  });
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 128 });
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await switcher.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect
    .poll(() => menu.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await page.keyboard.press("End");
  const create = page.getByRole("menuitem", { name: "Create organization", exact: true });
  await expect(create).toBeFocused();
  await expect(create).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(switcher).toBeFocused();
});

test("a Todo saved while the API cannot be reached shows at once and syncs when it can", async ({
  page
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const title = `Queued ${Date.now()}`;
  let reachable = false;
  await page.route("**/graphql", async (route) => {
    if (!reachable && route.request().postData()?.includes("mutation SyncPush")) {
      await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New todo", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Add Todo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: title, exact: true })).toBeVisible();
  const status = page.getByRole("status", { name: "Sync status", exact: true });
  await expect(status).toContainText("Syncing");
  await expect(status.getByLabel("Changes waiting", { exact: true })).toHaveText("1");

  reachable = true;
  // The browser's online event retries the Outbox at once instead of after its backoff.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(status).toContainText("Online", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: title, exact: true })).toBeVisible();
});

test("Note checklist retries additions and confirms pending deletions", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Checklist ${Date.now()}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).not.toHaveURL(/\/notes\/new$/);
  const title = `Checklist item ${Date.now()}`;
  const input = page.getByRole("textbox", { name: "Checklist item", exact: true });
  await input.fill(title);
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation AddTodoToNote")) {
      await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText("The checklist item could not be added.", { exact: false })
  ).toBeVisible();
  await expect(input).toHaveValue(title);
  await page.unroute("**/graphql");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: title, exact: true });
  await expect(checkbox).toBeVisible();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  const row = page.getByRole("listitem").filter({ has: checkbox });
  await row.getByRole("button", { name: "Delete Todo", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete todo", exact: true });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(checkbox).toBeVisible();
  await row.getByRole("button", { name: "Delete Todo", exact: true }).click();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation DeleteTodo")) await gate;
    await route.continue();
  });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(confirm).toBeVisible();
  release();
  await expect(confirm).toHaveCount(0);
  await expect(checkbox).toHaveCount(0);
});

test("Organization switches clear Assistant state and ignore late replies", async ({ page }) => {
  await signIn(page);
  const name = `Redesign scope ${Date.now()}`;
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await switcher.click();
  await page.getByRole("menuitem", { name: "Create organization", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create organization", exact: true });
  await create.getByRole("textbox", { name: "Organization name", exact: true }).fill(name);
  await create.getByRole("button", { name: "Save", exact: true }).click();
  await expect(create).toHaveCount(0);
  await switcher.click();
  await page.getByRole("menuitem", { name: "Personal", exact: true }).click();
  await expect(switcher).toContainText("Personal");
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let replyDelivered = false;
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation SendMessage")) {
      await gate;
      await route.fulfill({
        json: {
          data: {
            sendMessage: {
              status: "REPLIED",
              conversationId: "previous-organization",
              reply: "Previous Organization reply",
              message: null,
              toolActions: []
            }
          }
        }
      });
      replyDelivered = true;
    } else await route.continue();
  });
  await page.getByRole("link", { name: "Assistant", exact: true }).click();
  const composer = page.locator("#assistant-message");
  await composer.fill("Organization draft");
  await page.getByRole("button", { name: /^Appearance\b/ }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(composer).toHaveValue("Organization draft");
  await page.getByRole("button", { name: /^Language\b/ }).click();
  await page.getByRole("menuitemradio", { name: "Deutsch", exact: true }).click();
  await expect(composer).toHaveValue("Organization draft");
  await page.getByRole("button", { name: /^Sprache\b/ }).click();
  await page.getByRole("menuitemradio", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".ui-assistant__status")).toHaveText("Thinking…");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await composer.fill("Another Organization draft");
  await switcher.click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(switcher).toContainText(name);
  await expect(composer).toHaveValue("");
  await expect(page.getByText("Organization draft", { exact: true })).toHaveCount(0);
  release();
  await expect.poll(() => replyDelivered).toBe(true);
  await composer.fill("Current Organization draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(page.getByText("Previous Organization reply", { exact: true })).toHaveCount(0);
  await switcher.click();
  await page.getByRole("menuitem", { name: "Personal", exact: true }).click();
  await expect(switcher).toContainText("Personal");
  await page.unroute("**/graphql");
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  let releaseNote: () => void = () => {};
  const noteGate = new Promise<void>((resolve) => {
    releaseNote = resolve;
  });
  let noteSaved = false;
  let noteDelivered = false;
  await page.route("**/graphql", async (route) => {
    if (route.request().postData()?.includes("mutation CreateNote")) {
      const response = await route.fetch();
      noteSaved = true;
      await noteGate;
      await route.fulfill({ response });
      noteDelivered = true;
    } else await route.continue();
  });
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Previous Organization note");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => noteSaved).toBe(true);
  await switcher.click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Leave unsaved drafts?" })).toBeVisible();
  // The modal makes the page inert to role queries, so find the switcher by structure:
  // it is the dropdown trigger in the sidebar header (named by its text since #545).
  await expect(
    page.locator('[data-sidebar="header"] [data-slot="dropdown-menu-trigger"]')
  ).toContainText("Personal");
  releaseNote();
  await expect.poll(() => noteDelivered).toBe(true);
  await expect(switcher).toContainText(name);
  await expect(page.locator('input[value="Previous Organization note"]')).toHaveCount(0);
  await switcher.click();
  await page.getByRole("menuitem", { name: "Personal", exact: true }).click();
  await expect(switcher).toContainText("Personal");
});
