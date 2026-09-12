import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

for (const theme of ["light", "dark"] as const) {
  test(`nested workflows and feedback remain usable in ${theme} theme`, async ({
    page
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/auth");
    await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`auth-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Full name", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`signup-${theme}.png`), fullPage: true });
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    let state: "loading" | "error" | "empty" | "populated" = "loading";
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/graphql", async (route) => {
      const query = route.request().postData() ?? "";
      if (query.includes("query GetTodos")) {
        if (state === "loading") await gate;
        await route.fulfill({
          json:
            state === "error"
              ? { errors: [{ message: "Unavailable" }] }
              : {
                  data: {
                    todos:
                      state === "empty"
                        ? []
                        : [
                            {
                              id: "preview-one",
                              title: "Review the design system",
                              description: "Check typography, spacing, and both themes.",
                              completed: false,
                              createdAt: "2026-09-11",
                              updatedAt: "2026-09-11",
                              attachments: [
                                {
                                  id: "preview-file",
                                  originalName: "design-checklist.txt",
                                  mimeType: "text/plain",
                                  sizeBytes: 128,
                                  downloadUrl: null
                                }
                              ]
                            },
                            {
                              id: "preview-two",
                              title: "Prepare the next release",
                              description: "Review changes and verify the supported workflows.",
                              completed: true,
                              createdAt: "2026-09-11",
                              updatedAt: "2026-09-11",
                              attachments: []
                            }
                          ]
                  }
                }
        });
      } else if (query.includes("mutation CreateTodo")) {
        await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
      } else if (query.includes("mutation GenerateTodos")) {
        await route.fulfill({
          json: {
            data: { generateTodos: { status: "AI_NOT_CONFIGURED", message: null, todos: [] } }
          }
        });
      } else await route.continue();
    });
    await page.getByRole("link", { name: "Todos", exact: true }).click();
    await expect(page.getByRole("status", { name: "Loading todos...", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`loading-${theme}.png`) });
    state = "error";
    release();
    await expect(
      page.getByRole("alert").getByText("Something went wrong", { exact: true })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`error-${theme}.png`) });
    state = "empty";
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByText("No todos yet. Create your first one.", { exact: true })
    ).toBeVisible();
    state = "populated";
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Review the design system", exact: true })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`todos-${theme}.png`) });
    await page.locator('[data-slot="sidebar-trigger"]').click();
    await page.getByRole("button", { name: "Theme", exact: true }).hover();
    await page.mouse.move(800, 500);
    await page.screenshot({ path: testInfo.outputPath(`collapsed-${theme}.png`) });
    await page.setViewportSize({ width: 360, height: 900 });
    await page
      .getByRole("button", { name: /^Attachments/ })
      .first()
      .click();
    await expect(page.getByText("design-checklist.txt", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`phone-${theme}.png`), fullPage: true });
    await page.getByRole("button", { name: "AI todo generator", exact: true }).click();
    const ai = page.getByRole("dialog", { name: "AI todo generator", exact: true });
    await ai.getByLabel("Prompt", { exact: true }).fill("Prepare a release checklist");
    await ai.getByRole("button", { name: "Generate todos", exact: true }).click();
    await expect(page.getByText("AI is not set up yet.", { exact: true })).toBeVisible();
    await expect(ai.getByLabel("Prompt", { exact: true })).toHaveValue(
      "Prepare a release checklist"
    );
    await page.screenshot({ path: testInfo.outputPath(`ai-dialog-${theme}.png`) });
    await page.keyboard.press("Escape");
    for (const example of [
      {
        menu: "Open simple modal",
        title: "Quick create todo",
        input: "Title",
        submit: "Create from config"
      },
      {
        menu: "Open advanced modal",
        title: "Advanced todo planner",
        input: "Todo title",
        submit: "Create planned todo"
      }
    ]) {
      await page.getByRole("button", { name: "Examples", exact: true }).click();
      await page.getByRole("menuitem", { name: example.menu, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: example.title, exact: true });
      await dialog.getByLabel(example.input, { exact: true }).fill("Keep example draft");
      await dialog.getByRole("button", { name: example.submit, exact: true }).click();
      await expect(dialog.getByText("Something went wrong", { exact: true })).toBeVisible();
      await expect(dialog.getByLabel(example.input, { exact: true })).toHaveValue(
        "Keep example draft"
      );
      const violations = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(
        violations.violations.filter(
          (violation) => violation.impact === "serious" || violation.impact === "critical"
        )
      ).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${example.title}-${theme}.png`) });
      await page.keyboard.press("Escape");
    }
  });
}
