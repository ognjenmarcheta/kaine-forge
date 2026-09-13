import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { mockNotes } from "./helpers/notes";

async function openNote(page: Page, title = "Release planning") {
  if (await page.getByRole("link", { name: "Back to Notes", exact: true }).isVisible())
    await page.getByRole("link", { name: "Back to Notes", exact: true }).click();
  await page
    .locator(".ui-notes__rail")
    .getByRole("link", { name: new RegExp(title) })
    .click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true
  );
  const save = page.getByRole("button", { name: "Save", exact: true });
  if (await save.isVisible()) await expect(save).toBeInViewport();
}

for (const theme of ["light", "dark"] as const)
  for (const width of [390, 768, 1024, 1440]) {
    test(`Notes states at ${width.toString()}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const fixture = await mockNotes(page);
      await page.goto("/notes");
      await expect(page.getByRole("heading", { name: "All notes" })).toBeVisible();
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath("library.png") });
      await page.getByRole("button", { name: "New note", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath("empty.png") });
      await openNote(page);
      await fits(page);
      await page.screenshot({ path: testInfo.outputPath("populated.png") });
      const accessibility = await new AxeBuilder({ page }).include(".ui-notes").analyze();
      expect(accessibility.violations).toEqual([]);
      fixture.state.hold = true;
      await page.getByLabel("Body", { exact: true }).fill("Release notes ready for review.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.locator(".ui-notes__editor-header").getByRole("status")).toHaveText(
        "Saving…"
      );
      await page.screenshot({ path: testInfo.outputPath("saving.png") });
      fixture.state.fail = true;
      fixture.finish();
      await expect(
        page.getByRole("alert").getByText(/The save could not be confirmed/)
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("failed.png") });
      for (const state of ["library", "empty", "populated", "saving", "failed"])
        await testInfo.attach(`${state}-${width.toString()}-${theme}`, {
          path: testInfo.outputPath(`${state}.png`),
          contentType: "image/png"
        });
    });
  }

test("keyboard saving respects composition and preserves later edits across navigation", async ({
  page
}) => {
  const fixture = await mockNotes(page);
  await page.goto("/notes/a");
  const body = page.getByLabel("Body", { exact: true });
  await body.fill("Submitted draft");
  await body.dispatchEvent("keydown", { key: "s", ctrlKey: true, isComposing: true });
  expect(fixture.state.saves).toBe(0);
  fixture.state.hold = true;
  await body.press("Control+s");
  await expect.poll(() => fixture.state.saves).toBe(1);
  await body.fill("Newer unsaved text");
  await page
    .locator(".ui-notes__rail")
    .getByRole("link", { name: /Design observations/ })
    .click();
  await expect(body).toHaveValue("Keep the writing space calm and readable.");
  await body.fill("Second draft");
  fixture.finish();
  await expect(page).toHaveURL(/\/notes\/b$/);
  await expect(body).toHaveValue("Second draft");
  await page
    .locator(".ui-notes__rail")
    .getByRole("link", { name: /Release planning/ })
    .click();
  await expect(body).toHaveValue("Newer unsaved text");
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const warning = page.getByRole("dialog", { name: "Leave unsaved drafts?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Keep editing" }).click();
  await expect(body).toHaveValue("Newer unsaved text");
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  await warning.getByRole("button", { name: "Discard drafts and leave" }).click();
  await expect(page).toHaveURL(/\/todos$/);
});

test("new note completion leaves another note selected and creates a reloadable URL when opened", async ({
  page
}) => {
  const fixture = await mockNotes(page);
  await page.goto("/notes/new");
  await page.getByLabel("Title", { exact: true }).fill("A new idea");
  fixture.state.hold = true;
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.state.creates).toBe(1);
  await page.getByLabel("Body", { exact: true }).fill("Typed during creation");
  await page
    .locator(".ui-notes__rail")
    .getByRole("link", { name: /Design observations/ })
    .click();
  fixture.finish();
  await expect(page).toHaveURL(/\/notes\/b$/);
  await page
    .getByRole("region", { name: "Unsaved drafts" })
    .getByRole("link", { name: /A new idea/ })
    .click();
  await expect(page).toHaveURL(/\/notes\/created-1$/);
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Typed during creation");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".ui-notes__editor-header").getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("Typed during creation");
});

test("narrow navigation restores focus and note deletion returns to the list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mockNotes(page);
  await page.goto("/notes");
  await openNote(page);
  await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
  await page.getByRole("link", { name: "Back to Notes" }).click();
  await expect(page.locator('.ui-notes__rail a[data-note-key="a"]')).toBeFocused();
  await page.getByRole("button", { name: "Note options: Release planning" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete note" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Note options: Release planning" })).toBeFocused();
  await page.getByRole("button", { name: "Note options: Release planning" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator('.ui-notes__rail a[data-note-key="a"]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/notes$/);
});

test("external updates and deletion preserve the local draft", async ({ page }) => {
  const fixture = await mockNotes(page);
  await page.goto("/notes/a");
  await page.getByLabel("Body", { exact: true }).fill("My local edits");
  const note = fixture.notes[0];
  if (!note) throw new Error("Missing fixture");
  note.body = "External changes";
  fixture.publish("noteUpdated", "a");
  await expect(page.getByText(/This note changed elsewhere/)).toBeVisible();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("My local edits");
  await page.getByRole("button", { name: "Load latest version" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Keep editing" }).click();
  fixture.notes.splice(0, 1);
  fixture.publish("noteDeleted", "a");
  await expect(page.getByRole("button", { name: "Copy draft" })).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
  );
  await page.getByRole("button", { name: "Copy draft" }).click();
  await expect(page.getByText("The draft could not be copied.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Body", { exact: true })).toHaveValue("My local edits");
});

test("search preserves drafts and translated long content fits short viewports", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockNotes(page);
  await page.goto("/notes/a");
  await page.getByLabel("Body", { exact: true }).fill("LongWord".repeat(300));
  await page.getByRole("searchbox", { name: "Search notes" }).fill("Design");
  await expect(page.locator(".ui-notes__rows").getByRole("link")).toHaveCount(2);
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Deutsch", exact: true }).click();
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 400 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.ui-notes__editor-header button[type="submit"]')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("german-short.png") });
  await testInfo.attach("german-short", {
    path: testInfo.outputPath("german-short.png"),
    contentType: "image/png"
  });
  await page.getByRole("button", { name: "Sprache", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Srpski", exact: true }).click();
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 540 });
  await expect(page.locator('.ui-notes__editor-header button[type="submit"]')).toBeInViewport();
  await expect
    .poll(() =>
      page.locator("#note-body").evaluate((element) => element.scrollWidth <= element.clientWidth)
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("serbian-short.png") });
  await testInfo.attach("serbian-short", {
    path: testInfo.outputPath("serbian-short.png"),
    contentType: "image/png"
  });
  expect(errors).toEqual([]);
});

test("empty library and failed search have distinct recovery states", async ({
  page
}, testInfo) => {
  const fixture = await mockNotes(page);
  fixture.notes.splice(0);
  await page.goto("/notes");
  await expect(page.getByText("No notes yet.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("empty-library.png") });
  await testInfo.attach("empty-library", {
    path: testInfo.outputPath("empty-library.png"),
    contentType: "image/png"
  });
  fixture.state.loadFailed = true;
  await page.getByRole("searchbox", { name: "Search notes" }).fill("Missing");
  await expect(page.getByText("Notes could not be loaded.", { exact: false })).toBeVisible({
    timeout: 15000
  });
  await expect(page.getByText("No notes yet.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No matching notes.", { exact: false })).toHaveCount(0);
  fixture.state.loadFailed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No matching notes.", { exact: false })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Organization changes wait for saves and warn about newer drafts", async ({ page }) => {
  const fixture = await mockNotes(page);
  await page.goto("/notes/a");
  fixture.state.hold = true;
  await page.getByLabel("Body", { exact: true }).fill("Submitted");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => fixture.state.saves).toBe(1);
  await page.getByLabel("Body", { exact: true }).fill("Newer draft");
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await page.getByRole("menuitem", { name: "Second Organization", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Leave unsaved drafts?" });
  await expect(dialog.getByRole("button", { name: "Discard drafts and leave" })).toBeDisabled();
  expect(fixture.state.organization).toBe("org-one");
  fixture.finish();
  await expect(dialog.getByRole("button", { name: "Discard drafts and leave" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Discard drafts and leave" }).click();
  await expect(page.getByText("Note not found.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Body", exact: true })).toHaveCount(0);
});
