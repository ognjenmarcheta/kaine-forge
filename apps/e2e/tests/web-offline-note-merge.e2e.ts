import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { signIn, signUp } from "./helpers/auth";

const NOTES_CREATE = /^(New note|notes\.create)$/;
const CONFLICT_TITLE = /^(This note changed on another device|sync\.conflict\.title)$/;
const KEEP_MINE = /^(Keep mine|sync\.conflict\.keepMine)$/;
const BASE = ["one", "two", "three", "four", "five"];

function body(page: Page) {
  return page.getByLabel("Body", { exact: true });
}

/** Saves the Note body with one line replaced, while the device is offline. */
async function editLine(page: Page, line: number, text: string): Promise<void> {
  const lines = (await body(page).inputValue()).split("\n");
  lines[line] = text;
  await body(page).fill(lines.join("\n"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Changes waiting")).toHaveText("1");
}

async function reconnect(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(false);
  await expect(page.getByLabel("Changes waiting")).toHaveCount(0);
}

test("merges offline edits of different lines of one Note, and lets the second writer choose on the same line", async ({
  baseURL,
  browser,
  context,
  page
}) => {
  const suffix = Date.now().toString(36);
  // A new account per run, so no other spec's rows or Organization switch reach this one.
  const account = {
    email: `e2e-merge-${suffix}@test.test`,
    name: `E2E Merge ${suffix}`,
    password: `E2e-${suffix}-Pass!`
  } as const;

  await signUp(page, account);
  await page.goto("/notes");
  await page.getByRole("button", { name: NOTES_CREATE }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Shared ${suffix}`);
  await body(page).fill(BASE.join("\n"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Changes waiting")).toHaveCount(0);
  const noteUrl = new URL(page.url()).pathname;

  // The second device: the same User, signed in on another browser.
  const otherContext = await browser.newContext(baseURL ? { baseURL } : {});
  const other = await otherContext.newPage();
  try {
    await signIn(other, account);
    await other.goto(noteUrl);
    await expect(body(other)).toHaveValue(BASE.join("\n"));

    // Different lines, edited offline on both devices: both edits are kept.
    await context.setOffline(true);
    await otherContext.setOffline(true);
    await editLine(page, 0, "ONE");
    await editLine(other, 4, "FIVE");
    await reconnect(context, page);
    await reconnect(otherContext, other);

    const merged = ["ONE", "two", "three", "four", "FIVE"].join("\n");
    for (const device of [page, other]) {
      await device.reload();
      await expect(body(device)).toHaveValue(merged);
    }

    // The same line, edited offline on both devices: the second writer chooses.
    await context.setOffline(true);
    await otherContext.setOffline(true);
    await editLine(page, 2, "three from the laptop");
    await editLine(other, 2, "three from the phone");
    await reconnect(context, page);
    await otherContext.setOffline(false);

    const conflict = other.getByRole("dialog", { name: CONFLICT_TITLE });
    await expect(conflict).toBeVisible();
    await conflict.getByRole("button", { name: KEEP_MINE }).click();
    await expect(conflict).toBeHidden();

    // Keeping mine sends the body again; each device shows it once the server has it.
    const chosen = ["ONE", "two", "three from the phone", "four", "FIVE"].join("\n");
    for (const device of [page, other]) {
      await expect(async () => {
        await device.reload();
        await expect(body(device)).toHaveValue(chosen, { timeout: 1_000 });
      }).toPass();
    }
  } finally {
    await otherContext.close();
  }
});
