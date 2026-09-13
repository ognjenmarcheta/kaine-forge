import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

// The only assistant behaviour e2e can honestly gate. CI has no provider key,
// so assistant.ai.ts returns AI_NOT_CONFIGURED deterministically — no model
// call, no cost, no flake. What this proves is that the unconfigured path
// surfaces a message instead of hanging or blanking, which is what a
// contributor without a key actually meets.
const ASSISTANT_NAV = /^(Assistant|navigation\.assistant)$/;
const ASSISTANT_INPUT = /^(Message|assistant\.inputLabel)$/;
const ASSISTANT_SEND = /^(Send|assistant\.send)$/;
const NOT_CONFIGURED = /(The AI assistant is not configured\.|assistant\.ai\.notConfigured)/;

test("tells the user when the assistant has no provider configured", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: ASSISTANT_NAV }).click();
  await expect(page).toHaveURL(/\/assistant$/);

  await page.getByRole("textbox", { name: ASSISTANT_INPUT }).fill("Add a todo to buy milk");
  await page.getByRole("button", { name: ASSISTANT_SEND }).click();

  await expect(page.getByText(NOT_CONFIGURED)).toBeVisible();
  await page.getByRole("button", { name: /^(Use this prompt|assistant\.usePrompt)$/ }).click();
  await expect(page.getByRole("textbox", { name: ASSISTANT_INPUT })).toHaveValue(
    "Add a todo to buy milk"
  );
});
