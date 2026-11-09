import { expect, test, type Page } from "@playwright/test";

import { AUTH_LABELS, signIn } from "./helpers/auth";

// Baselines are PNGs rendered by the Chromium in the official Playwright
// container. Another browser renders fonts differently and would fail every
// comparison, so these specs run only through `pnpm --filter @repo/e2e
// test:visual`, which connects to that container (CONTRIBUTING.md, Visual
// regression baselines).
test.skip(
  !process.env.PW_TEST_CONNECT_WS_ENDPOINT,
  "Visual baselines compare only in the Playwright container: run pnpm --filter @repo/e2e test:visual."
);

// Fixed locale and time zone keep formatted dates the same on every machine.
test.use({ reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });

/** Two fixed todos so the populated shell does not depend on seeded rows. */
async function mockPopulatedTodos(page: Page): Promise<void> {
  await page.route("**/graphql", async (route) => {
    if (!(route.request().postData() ?? "").includes("query SyncPull")) {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        data: {
          syncPull: {
            todos: [
              {
                id: "visual-one",
                title: "Review the design system",
                description: "Check typography, spacing, and both themes.",
                completed: false,
                noteId: null,
                createdAt: "2026-09-11",
                updatedAt: "2026-09-11",
                attachments: []
              },
              {
                id: "visual-two",
                title: "Prepare the next release",
                description: "Review changes and verify the supported workflows.",
                completed: true,
                noteId: null,
                createdAt: "2026-09-11",
                updatedAt: "2026-09-11",
                attachments: []
              }
            ],
            notes: [],
            deleted: [],
            cursor: "1",
            hasMore: false,
            resetRequired: false,
            older: []
          }
        }
      }
    });
  });
}

test.describe("visual baselines", { tag: "@visual" }, () => {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${theme} theme`, () => {
      test.use({ colorScheme: theme });

      test(`sign-in at 360px matches the ${theme} baseline`, async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 900 });
        await page.goto("/auth");
        await expect(page.getByRole("textbox", { name: AUTH_LABELS.email })).toBeVisible();
        await expect(page).toHaveScreenshot(`sign-in-${theme}.png`, { fullPage: true });
      });

      test(`populated todos shell at 1440px matches the ${theme} baseline`, async ({ page }) => {
        await signIn(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        await mockPopulatedTodos(page);
        await page.goto("/todos");
        await expect(
          page.getByRole("checkbox", { name: "Review the design system", exact: true })
        ).toBeVisible();
        // The header badge passes through "Syncing"; capture the settled state.
        await expect(page.getByRole("status", { name: "Sync status", exact: true })).toHaveText(
          "Online"
        );
        await expect(page).toHaveScreenshot(`todos-populated-${theme}.png`);
      });
    });
  }

  test("sign-up at 360px matches the light baseline", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/auth");
    await page.getByRole("link", { name: AUTH_LABELS.signup }).click();
    await expect(page.getByRole("textbox", { name: AUTH_LABELS.name })).toBeVisible();
    await expect(page).toHaveScreenshot("sign-up-light.png", { fullPage: true });
  });
});
