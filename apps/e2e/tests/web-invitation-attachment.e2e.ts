import { expect, test } from "@playwright/test";

import { authApi, signIn, signUp } from "./helpers/auth";
import { isRecord, selectOrganization } from "./helpers/organizations";

/**
 * The template shell has no invite UI and the console email adapter only logs,
 * so the owner side runs through the better-auth organization routes under
 * /api/auth with the page's session cookie. The invited user still signs up
 * through the real UI and accepts by invitation id (ADR 0007: the invited email
 * may accept before verifying it). Recipient binding (a different signed-in
 * email is refused) stays with the packages/auth invitation security tests.
 *
 * Todo attachment upload requires S3/MinIO (CI only provides Postgres).
 * Set E2E_STORAGE_ENABLED=1 to run the real storage flow below.
 */
test("an invited user becomes a member and sees the organization after accepting", async ({
  page,
  browser,
  baseURL
}) => {
  const suffix = Date.now().toString(36);
  const organizationName = `E2E Invite Org ${suffix}`;
  const invitee = {
    email: `invitee-${suffix}@test.test`,
    name: `Invitee ${suffix}`,
    password: "ChangeMe123!"
  } as const;

  // The seeded owner creates the organization and the invitation.
  await signIn(page);
  const organization = await authApi(page, "organization/create", {
    name: organizationName,
    slug: `e2e-invite-${suffix}`
  });
  if (typeof organization.id !== "string") {
    throw new Error("organization/create did not return an id");
  }
  const invitation = await authApi(page, "organization/invite-member", {
    email: invitee.email,
    role: "member",
    organizationId: organization.id
  });
  if (typeof invitation.id !== "string") {
    throw new Error("organization/invite-member did not return an id");
  }

  // The invited person registers in a separate browser context, so the owner's
  // session and the seeded user's active organization stay untouched.
  const inviteeContext = await browser.newContext(baseURL ? { baseURL } : {});
  try {
    const inviteePage = await inviteeContext.newPage();
    await signUp(inviteePage, invitee);

    const accepted = await authApi(inviteePage, "organization/accept-invitation", {
      invitationId: invitation.id
    });
    const member = accepted.member;
    expect(isRecord(member) ? member.organizationId : member).toBe(organization.id);
    const acceptedInvitation = accepted.invitation;
    expect(isRecord(acceptedInvitation) ? acceptedInvitation.status : acceptedInvitation).toBe(
      "accepted"
    );

    // Membership shows up in the UI: the switcher lists the organization and can
    // make it active.
    await inviteePage.goto("/dashboard");
    await selectOrganization(inviteePage, organizationName);
  } finally {
    await inviteeContext.close();
  }
});

test("uploads, downloads, and removes a Todo attachment", async ({ page }) => {
  test.skip(process.env.E2E_STORAGE_ENABLED !== "1", "Requires a configured local S3/MinIO bucket");
  await signIn(page);
  await page.getByRole("link", { name: "Todos", exact: true }).click();
  const title = `Attachment ${Date.now()}`;
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New todo", exact: true });
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Add Todo", exact: true }).click();
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("checkbox", { name: title, exact: true })
  });
  await row.getByRole("button", { name: /^Attachments/ }).click();
  await row.locator('input[type="file"]').setInputFiles({
    name: "redesign-check.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment round trip")
  });
  await expect(row.getByText("redesign-check.txt", { exact: false })).toBeVisible();
  const downloadUrl = await row
    .getByRole("link", { name: "Download", exact: true })
    .getAttribute("href");
  expect(downloadUrl).toBeTruthy();
  const response = await page.request.get(downloadUrl ?? "");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toBe("Attachment round trip");
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Remove attachment", exact: true })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(row.getByText("redesign-check.txt", { exact: false })).toHaveCount(0);
  await row.getByRole("button", { name: "Actions for " + title, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete todo", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});
