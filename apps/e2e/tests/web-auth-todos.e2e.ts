import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { NAV_LABELS, signIn } from "./helpers/auth";

function blockingA11yViolations(results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  return results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );
}

test("has no critical or serious a11y violations on core pages", async ({ page }) => {
  await page.goto("/auth");
  const authResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(authResults)).toEqual([]);

  await signIn(page);
  const dashboardResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(dashboardResults)).toEqual([]);

  await page.getByRole("link", { name: NAV_LABELS.todos }).click();
  const todosResults = await new AxeBuilder({ page }).analyze();
  expect(blockingA11yViolations(todosResults)).toEqual([]);
});
