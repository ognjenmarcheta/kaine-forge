import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

// Only the production build registers the service worker; the dev server never does.
test.skip(process.env["E2E_SERVE_BUILD"] !== "true", "needs the production build");
test.use({ serviceWorkers: "allow" });

test("the app starts with no network and still shows a change made offline", async ({
  context,
  page
}) => {
  const title = `Offline start ${Date.now().toString(36)}`;
  await signIn(page);
  await page.goto("/todos");
  await expect(page.getByRole("heading", { name: /^Todos loaded/ })).toBeVisible();
  // The worker keeps the shell once it is active; it controls the next page load.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.getByLabel("What needs to be done?").fill(title);
  await page.getByLabel("What needs to be done?").press("Enter");
  // The count shows once the change is stored in the Outbox.
  await expect(page.getByLabel("Changes waiting")).toHaveText("1");
  await page.reload();

  await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
  await expect(page.getByLabel("Changes waiting")).toHaveText("1");
});
