import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

// Two tabs of one signed-in browser: the second tab must follow writes made
// in the first over the GraphQL subscriptions, without a reload.

test("a Todo created in one tab appears in another", async ({ context }) => {
  const title = `Realtime Todo ${Date.now().toString(36)}`;
  const writer = await context.newPage();
  await signIn(writer);
  const reader = await context.newPage();
  await reader.goto("/todos");
  await writer.goto("/todos");
  await expect(reader.getByRole("heading", { name: /^Todos loaded/ })).toBeVisible();

  await writer.getByLabel("What needs to be done?").fill(title);
  await writer.getByLabel("What needs to be done?").press("Enter");

  await expect(reader.getByRole("checkbox", { name: title })).toBeVisible();
});

test("a checklist item added in one tab appears in the Note open in another", async ({
  context
}) => {
  const noteTitle = `Realtime Note ${Date.now().toString(36)}`;
  const item = `Checklist item ${Date.now().toString(36)}`;
  const writer = await context.newPage();
  await signIn(writer);
  await writer.goto("/notes/new");
  await writer.getByRole("textbox", { name: "Title", exact: true }).fill(noteTitle);
  await writer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(writer).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const reader = await context.newPage();
  await reader.goto(writer.url());
  const readerChecklist = reader.getByRole("region", { name: "Checklist" });
  await expect(readerChecklist.getByRole("textbox", { name: "Checklist item" })).toBeVisible();

  await writer.getByRole("textbox", { name: "Checklist item" }).fill(item);
  await writer.getByRole("textbox", { name: "Checklist item" }).press("Enter");

  await expect(readerChecklist.getByRole("checkbox", { name: item })).toBeVisible();
});
