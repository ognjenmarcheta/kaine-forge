import { expect, test } from "@playwright/test";

import { AUTH_LABELS, NAV_LABELS, signIn } from "./helpers/auth";
import { createOrganization, isRecord } from "./helpers/organizations";

const MEMBERS_LABELS = {
  inviteSubmit: /^(Send invitation|organizations\.invite\.submit)$/,
  pending: /^(Pending invitations|organizations\.invitations\.title)$/,
  accept: /^(Accept|organizations\.invitation\.accept)$/
} as const;

/**
 * The seeded owner invites through the /members form; the invited person opens
 * the accept page signed out, signs up, comes back to the same invitation, and
 * accepts it (ADR 0007: the invited email may accept before verifying it). The
 * console email adapter only logs the accept link, so the test reads the
 * invitation id from the same list the pending invitations section shows.
 * Recipient binding (a different signed-in email is refused) stays with the
 * packages/auth invitation security tests.
 *
 * Todo attachment upload requires S3-compatible storage (CI only provides Postgres).
 * Set E2E_STORAGE_ENABLED=1 to run the real storage flow below.
 */
test("an invited user signs up from the invitation link and joins the organization", async ({
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

  // The seeded owner creates the organization, which becomes active, and invites.
  await signIn(page);
  await createOrganization(page, organizationName);
  await expect(page.getByRole("button", { name: NAV_LABELS.organization })).toContainText(
    organizationName
  );
  await page.goto("/members");
  const inviteForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: MEMBERS_LABELS.inviteSubmit }) });
  await inviteForm.getByLabel(AUTH_LABELS.email).fill(invitee.email);
  await inviteForm.getByRole("button", { name: MEMBERS_LABELS.inviteSubmit }).click();
  await expect(
    page.getByRole("list", { name: MEMBERS_LABELS.pending }).getByText(invitee.email)
  ).toBeVisible();

  const listed = await page.request.get("/api/auth/organization/list-invitations");
  expect(listed.ok()).toBe(true);
  const invitations: unknown = await listed.json();
  const invitation = Array.isArray(invitations)
    ? invitations.find((entry: unknown) => isRecord(entry) && entry.email === invitee.email)
    : undefined;
  if (!isRecord(invitation) || typeof invitation.id !== "string") {
    throw new Error("the pending invitation is not listed");
  }
  const invitationPath = `/invitations/${invitation.id}`;

  // The invited person uses a separate browser context, so the owner's session
  // and the seeded user's active organization stay untouched.
  const inviteeContext = await browser.newContext(baseURL ? { baseURL } : {});
  try {
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(invitationPath);
    await expect(inviteePage).toHaveURL(/\/auth\?redirect=%2Finvitations%2F/);

    await inviteePage.getByRole("button", { name: AUTH_LABELS.signup }).click();
    await inviteePage.getByLabel(AUTH_LABELS.name).fill(invitee.name);
    await inviteePage.getByLabel(AUTH_LABELS.email).fill(invitee.email);
    await inviteePage.getByLabel(AUTH_LABELS.password).fill(invitee.password);
    await inviteePage.getByLabel(AUTH_LABELS.confirmPassword).fill(invitee.password);
    await inviteePage.locator("form").getByRole("button", { name: AUTH_LABELS.signup }).click();
    await expect(inviteePage).toHaveURL(new RegExp(`${invitationPath}$`));

    await expect(inviteePage.getByRole("heading", { name: organizationName })).toBeVisible();
    await inviteePage.getByRole("button", { name: MEMBERS_LABELS.accept }).click();
    await expect(inviteePage).toHaveURL(/\/dashboard$/);

    // Accepting made the organization active.
    await expect(inviteePage.getByRole("button", { name: NAV_LABELS.organization })).toContainText(
      organizationName
    );
  } finally {
    await inviteeContext.close();
  }
});

test("uploads, downloads, and removes a Todo attachment", async ({ page }) => {
  test.skip(
    process.env.E2E_STORAGE_ENABLED !== "1",
    "Requires a configured local S3-compatible bucket"
  );
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
