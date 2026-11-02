import { expect, test, type Page } from "@playwright/test";

import { signIn, signUp } from "./helpers/auth";

// The offline reload comes from the service worker, which only the production build registers.
test.skip(process.env["E2E_SERVE_BUILD"] !== "true", "needs the production build");
test.use({ serviceWorkers: "allow" });

const NEW_TODO_LABEL = "What needs to be done?";
const TODOS_DESCRIPTION_LABEL = /^(Description|todos\.form\.descriptionPlaceholder)$/;
const TODOS_TITLE_LABEL = /^(Title|todos\.form\.titlePlaceholder)$/;
const TODOS_DELETE_CONFIRM_NAME = /^(Delete todo|todos\.deleteConfirmTitle)$/;
const BUTTON_DELETE_NAME = /^(Delete|button\.delete)$/;
const REJECTED_DELETED =
  /^(A change was not saved: the item was deleted\.|sync\.rejected\.NOT_FOUND)$/;

async function openTodos(page: Page): Promise<void> {
  await page.goto("/todos");
  await expect(page.getByRole("heading", { name: /^Todos loaded/ })).toBeVisible();
}

async function addTodo(page: Page, title: string): Promise<void> {
  await page.getByLabel(NEW_TODO_LABEL).fill(title);
  await page.getByLabel(NEW_TODO_LABEL).press("Enter");
  await expect(page.getByRole("checkbox", { name: title })).toBeVisible();
  // The input clears once the Outbox stores the Todo; Enter before that adds nothing.
  await expect(page.getByLabel(NEW_TODO_LABEL)).toHaveValue("");
}

function todoRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("checkbox", { name: title }) });
}

async function editTodo(
  page: Page,
  title: string,
  fields: { title?: string; description?: string }
): Promise<void> {
  await todoRow(page, title).getByRole("button", { name: title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit todo", exact: true });
  if (fields.title !== undefined) await dialog.getByLabel(TODOS_TITLE_LABEL).fill(fields.title);
  if (fields.description !== undefined) {
    await dialog.getByLabel(TODOS_DESCRIPTION_LABEL).fill(fields.description);
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function deleteTodo(page: Page, title: string): Promise<void> {
  await todoRow(page, title)
    .getByRole("button", { name: "Actions for " + title })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: TODOS_DELETE_CONFIRM_NAME })
    .getByRole("button", { name: BUTTON_DELETE_NAME })
    .click();
  await expect(page.getByRole("checkbox", { name: title })).toHaveCount(0);
}

test("offline changes reach another device, edits of other fields survive, and a delete wins", async ({
  baseURL,
  browser,
  context,
  page
}) => {
  const suffix = Date.now().toString(36);
  // A new account per run, so no other spec's rows or Organization switch reach this one.
  const account = {
    email: `e2e-sync-${suffix}@test.test`,
    name: `E2E Sync ${suffix}`,
    password: `E2e-${suffix}-Pass!`
  } as const;
  const kept = `Kept ${suffix}`;
  const renamed = `Renamed ${suffix}`;
  const doomed = `Deleted elsewhere ${suffix}`;
  const created = `Created offline ${suffix}`;

  await signUp(page, account);
  await openTodos(page);
  await addTodo(page, kept);
  await addTodo(page, doomed);
  await expect(page.getByLabel("Changes waiting")).toHaveCount(0);

  // The second device: the same User, signed in on another browser.
  const otherContext = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    serviceWorkers: "allow"
  });
  const other = await otherContext.newPage();
  try {
    await signIn(other, account);
    await openTodos(other);
    await expect(other.getByRole("checkbox", { name: kept })).toBeVisible();
    await expect(other.getByRole("checkbox", { name: doomed })).toBeVisible();

    // The worker keeps the shell once it is active; it serves the offline reload.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await addTodo(page, created);
    // Completing sends only `completed`, so the other device's rename must survive it.
    await page.getByRole("checkbox", { name: kept }).check();
    await editTodo(page, doomed, { description: "Edited offline" });
    await expect(page.getByLabel("Changes waiting")).toHaveText("3");

    // Rows and Pending Changes both survive a reload with no network.
    await page.reload();
    await expect(page.getByRole("checkbox", { name: created })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: kept })).toBeChecked();
    await expect(page.getByLabel("Changes waiting")).toHaveText("3");

    // Meanwhile the other device renames one Todo and deletes the one edited offline.
    await editTodo(other, kept, { title: renamed });
    await deleteTodo(other, doomed);

    await context.setOffline(false);

    // The edit of the deleted Todo is refused, the delete wins, and the rest syncs.
    await expect(page.getByText(REJECTED_DELETED)).toBeVisible();
    await expect(page.getByLabel("Changes waiting")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: doomed })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: created })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: renamed })).toBeChecked();

    // The other device gets the offline changes from the server.
    await expect(other.getByRole("checkbox", { name: created })).toBeVisible();
    await expect(other.getByRole("checkbox", { name: renamed })).toBeChecked();
    await expect(other.getByRole("checkbox", { name: doomed })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});
