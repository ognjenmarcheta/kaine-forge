import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockTodos } from "./helpers/todos";

test("successful detail creation restores quick-add focus", async ({ page }) => {
  await mockTodos(page);
  await page.goto("/todos");
  await page.getByRole("button", { name: "Add details" }).click();
  const dialog = page.getByRole("dialog", { name: "New todo" });
  await dialog.getByLabel("Title", { exact: true }).fill("Focus example");
  await dialog.getByRole("button", { name: "Add Todo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("What needs to be done?")).toBeFocused();
});

test("successful deletion restores focus to the next Todo", async ({ page }) => {
  await mockTodos(page);
  await page.goto("/todos");
  await page.getByRole("button", { name: "Actions for Prepare release notes" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete todo" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Review accessibility" })).toBeFocused();
});

for (const theme of ["light", "dark"] as const)
  for (const width of [390, 768, 1024, 1440]) {
    test(`Todo states at ${String(width)}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const fixture = await mockTodos(page);
      await page.goto("/todos");
      await expect(page.getByRole("checkbox", { name: "Prepare release notes" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const shot = async (name: string) => {
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        await testInfo.attach(name, {
          path: testInfo.outputPath(`${name}.png`),
          contentType: "image/png"
        });
      };
      await shot("populated");
      expect((await new AxeBuilder({ page }).include(".ui-todos").analyze()).violations).toEqual(
        []
      );
      await page.getByRole("button", { name: "Completed", exact: true }).click();
      await expect(page.getByRole("checkbox")).toHaveCount(1);
      await shot("filtered");
      await page.getByRole("button", { name: "All", exact: true }).click();
      fixture.state.hold = true;
      await page.getByRole("button", { name: "Prepare release notes", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit todo" });
      await dialog.getByLabel("Description", { exact: true }).fill("A revised release summary.");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
      await shot("pending");
      fixture.state.fail = true;
      fixture.finish();
      await expect(dialog.getByRole("alert")).toBeVisible();
      await shot("failed");
      await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
      await page
        .getByRole("dialog", { name: "Discard changes?" })
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      fixture.rows.splice(0);
      fixture.publish("todoDeleted", "a");
      await expect(page.getByText("No todos yet. Create your first one.")).toBeVisible();
      await shot("empty");
    });
  }
test("quick creation shares details, respects IME, validates and restores focus", async ({
  page
}) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  const quick = page.getByLabel("What needs to be done?");
  await quick.fill(" ");
  await expect(page.getByRole("button", { name: "Add Todo", exact: true })).toBeDisabled();
  await quick.fill("x".repeat(256));
  await expect(page.getByRole("button", { name: "Add Todo", exact: true })).toBeDisabled();
  await quick.fill("New item");
  await quick.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  expect(fixture.state.creates).toBe(0);
  await page.getByRole("button", { name: "Add details" }).click();
  const dialog = page.getByRole("dialog", { name: "New todo" });
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("New item");
  await dialog.getByLabel("Description", { exact: true }).fill("Shared description");
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByText("Description added. Add Todo saves both fields.")).toBeVisible();
  await quick.press("Enter");
  await expect(quick).toHaveValue("");
  await expect(quick).toBeFocused();
  expect(fixture.state.creates).toBe(1);
  expect(fixture.rows[0]?.description).toBe("Shared description");
});
test("search and status use URL history without discarding quick drafts", async ({ page }) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  await page.getByLabel("What needs to be done?").fill("Keep this draft");
  await page.getByLabel("Search Todos").fill("keyboard");
  await expect(page).toHaveURL(/search=keyboard/);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("No Todos match your search.")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByLabel("What needs to be done?")).toHaveValue("Keep this draft");
  expect(fixture.state.searches).toContain("keyboard");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Leave Todos?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(/todos/);
});
test("completion waits for confirmation and filtered removal restores row focus", async ({
  page
}) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos?status=open");
  fixture.state.hold = true;
  const checkbox = page.getByRole("checkbox", { name: "Prepare release notes" });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();
  expect(fixture.state.updates).toBe(1);
  fixture.finish();
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Todos loaded: 0" })).toBeFocused();
});
test("external updates preserve edits and external deletion keeps copyable text", async ({
  page
}) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  await page.getByRole("button", { name: "Prepare release notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit todo" });
  const description = dialog.getByLabel("Description", { exact: true });
  await description.fill("Local text");
  if (fixture.rows[0]) fixture.rows[0].description = "External text";
  fixture.publish("todoUpdated", "a");
  await expect(dialog.getByText(/This Todo changed elsewhere/)).toBeVisible();
  await expect(description).toHaveValue("Local text");
  await description.dispatchEvent("keydown", { key: "s", ctrlKey: true, isComposing: true });
  expect(fixture.state.updates).toBe(0);
  await description.press("Control+s");
  await expect(dialog).toHaveCount(0);
  expect(fixture.rows[0]?.description).toBe("Local text");
  await page.getByRole("button", { name: "Prepare release notes", exact: true }).click();
  await description.fill("Recover me");
  fixture.rows.splice(0, 1);
  fixture.publish("todoDeleted", "a");
  await expect(dialog.getByText(/This Todo was deleted elsewhere/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(description).toHaveValue("Recover me");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
  );
  await dialog.getByRole("button", { name: "Copy draft" }).click();
  await expect(dialog.getByText(/Could not copy/)).toBeVisible();
});
test("menus, AI feedback, and confirmed deletion stay keyboard accessible", async ({ page }) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "AI todo generator" }).click();
  const ai = page.getByRole("dialog", { name: "AI todo generator" });
  await ai.getByLabel("Prompt", { exact: true }).fill("Plan release");
  await ai.getByRole("button", { name: "Generate todos" }).click();
  await expect(ai.getByText("AI is not set up yet.")).toBeVisible();
  await expect(ai.getByLabel("Prompt", { exact: true })).toHaveValue("Plan release");
  fixture.state.generation = "CREATED";
  await ai.getByRole("button", { name: "Generate todos" }).click();
  await expect(page.getByText("Todos created: 2")).toBeVisible();
  const menu = page.getByRole("button", { name: "Actions for Prepare release notes" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete todo" });
  await expect(confirm.getByText(/linked Note checklist/)).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Prepare release notes" })).toHaveCount(0);
});

test("Organization changes wait for quick creation and discard drafts only on request", async ({
  page
}) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  fixture.state.hold = true;
  await page.getByLabel("What needs to be done?").fill("Submitted Todo");
  await page.getByRole("button", { name: "Add Todo", exact: true }).click();
  await expect.poll(() => fixture.state.creates).toBe(1);
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByRole("menuitem", { name: "Second Organization", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Leave Todos?" });
  await expect(dialog.getByRole("button", { name: "Discard drafts and leave" })).toBeDisabled();
  expect(fixture.organization.organization).toBe("org-one");
  fixture.finish();
  await expect.poll(() => fixture.organization.organization).toBe("org-two");
  await expect(page.getByLabel("What needs to be done?")).toHaveValue("");
  await page.getByLabel("What needs to be done?").fill("Keep this one");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByRole("menuitem", { name: "Create organization", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("What needs to be done?")).toHaveValue("Keep this one");
});

test("long content and drafts survive theme and language changes in short viewports", async ({
  page
}, testInfo) => {
  const fixture = await mockTodos(page);
  if (fixture.rows[0]) {
    fixture.rows[0].title = "LongWord".repeat(30);
    fixture.rows[0].description = "UnbrokenDescription".repeat(60);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/todos");
  await page.getByLabel("What needs to be done?").fill("Keep my draft");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Deutsch", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 400 });
  await expect(page.getByLabel("Was ist zu erledigen?")).toHaveValue("Keep my draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("german-short.png"), fullPage: true });
  await page.getByRole("button", { name: "Sprache", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Srpski", exact: true }).click();
  await page.getByRole("button", { name: "Tema", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Tamna", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 540 });
  await expect(page.getByLabel("Šta treba uraditi?")).toHaveValue("Keep my draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("serbian-short.png"), fullPage: true });
  for (const name of ["german-short", "serbian-short"])
    await testInfo.attach(name, {
      path: testInfo.outputPath(name + ".png"),
      contentType: "image/png"
    });
});

test("failed loading and Load more recover without losing existing rows", async ({ page }) => {
  const fixture = await mockTodos(page);
  const base = fixture.rows[0];
  if (!base) throw new Error("missing fixture");
  for (let i = 0; i < 55; i++)
    fixture.rows.push({ ...base, id: String(i), title: "Extra " + String(i) });
  fixture.state.loadFailed = true;
  await page.goto("/todos");
  await expect(page.getByText(/Could not load Todos/)).toBeVisible();
  fixture.state.loadFailed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(50);
  fixture.state.loadFailed = true;
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText(/Could not load more Todos/)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(50);
  fixture.state.loadFailed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(57);
});

test("uploads keep their Todo through filtering and expose upload errors and confirmed removal", async ({
  page
}) => {
  const fixture = await mockTodos(page);
  await page.goto("/todos");
  fixture.state.holdUpload = true;
  const row = page.locator('[data-todo-id="a"]');
  await row.getByRole("button", { name: /^Attachments/ }).click();
  await row
    .locator('input[type="file"]')
    .setInputFiles({ name: "checklist.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
  await expect.poll(() => fixture.state.uploadTodo).toBe("a");
  await page.getByLabel("Search Todos").fill("accessibility");
  await expect(row).toHaveCount(0);
  await expect(page.getByText(/Uploading checklist.txt to Prepare release notes/)).toBeVisible();
  fixture.finishUpload();
  await expect.poll(() => fixture.state.confirms).toBe(1);
  await page.getByLabel("Search Todos").fill("");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^Attachments/ }).click();
  await expect(row.getByText("checklist.txt", { exact: false })).toBeVisible();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Remove attachment" })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(row.getByText("checklist.txt", { exact: false })).toHaveCount(0);
  fixture.state.failUpload = true;
  await row
    .locator('input[type="file"]')
    .setInputFiles({ name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
  await expect(page.getByText(/Could not attach retry.txt/)).toBeVisible();
  expect(fixture.state.confirms).toBe(1);
});
