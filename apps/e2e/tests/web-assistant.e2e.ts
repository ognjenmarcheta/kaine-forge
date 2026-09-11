import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

// The only assistant behaviour e2e can honestly gate. CI has no provider key,
// so assistant.ai.ts returns AI_NOT_CONFIGURED deterministically — no model
// call, no cost, no flake. What this proves is that the unconfigured path
// surfaces a message instead of hanging or blanking, which is what a
// contributor without a key actually meets.
const ASSISTANT_NAV = /^(Assistant|navigation\.assistant)$/;
const ASSISTANT_PLACEHOLDER =
  /^(e\.g\. Create a todo to buy milk, then mark it done|assistant\.placeholder)$/;
const ASSISTANT_SEND = /^(Send|assistant\.send)$/;
const NOT_CONFIGURED = /(The AI assistant is not configured\.|assistant\.ai\.notConfigured)/;

test("tells the user when the assistant has no provider configured", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: ASSISTANT_NAV }).click();
  await expect(page).toHaveURL(/\/assistant$/);

  await page.getByPlaceholder(ASSISTANT_PLACEHOLDER).fill("Add a todo to buy milk");
  await page.getByRole("button", { name: ASSISTANT_SEND }).click();

  await expect(page.getByText(NOT_CONFIGURED)).toBeVisible();
});
