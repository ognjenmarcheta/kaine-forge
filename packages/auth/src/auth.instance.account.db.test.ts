import {
  filesTable,
  membersTable,
  organizationStoragePurgesTable,
  organizationsTable,
  publicAssetPurgesTable,
  usersTable
} from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real auth instance on an in-process Postgres with every migration
// applied, so account changes run through better-auth's own routes.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("WEB_APP_URL", "http://localhost:3000");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database } = vi.hoisted(() => ({ database: { current: null as TestDatabase | null } }));

// Only the schema, never the real `@repo/db` index: its client throws without
// DATABASE_URL, which a fresh checkout or worktree does not have.
vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({ jobQueue: { enqueue: vi.fn().mockResolvedValue("job-1") } }));

const { jobQueue } = await import("@repo/jobs/client");
const { createAuthInstance } = await import("./auth.instance");

const auth = createAuthInstance();
const enqueue = vi.mocked(jobQueue.enqueue);

function testDatabase(): TestDatabase {
  if (!database.current) {
    throw new Error("test database not created");
  }
  return database.current;
}

function cookieHeaders(headers: Headers): Headers {
  return new Headers({
    cookie: headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ")
  });
}

async function signUp(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "Secret123!Secret", name: label },
    returnHeaders: true
  });
  return { email, headers: cookieHeaders(headers), userId: response.user.id };
}

async function createOrganization(headers: Headers, name: string): Promise<string> {
  const response = await auth.api.createOrganization({
    body: { name, slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}` },
    headers
  });
  if (!response) {
    throw new Error("expected organization to be created");
  }
  return response.id;
}

async function addMember(organizationId: string, userId: string, role: string) {
  await testDatabase().db.insert(membersTable).values({ organizationId, userId, role });
}

async function personalOrganizationId(userId: string): Promise<string> {
  const [organization] = await testDatabase()
    .db.select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.userId, userId));
  if (!organization) {
    throw new Error("expected a personal organization");
  }
  return organization.id;
}

async function userRow(userId: string) {
  const [user] = await testDatabase()
    .db.select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

async function organizationRow(organizationId: string) {
  const [organization] = await testDatabase()
    .db.select({ userId: organizationsTable.userId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
  return organization ?? null;
}

const SUBJECTS = {
  approval: "Approve your email address change",
  deletion: "Confirm your account deletion",
  verification: "Verify your email address"
} as const;

// Hooks enqueue after rendering, without awaiting; wait for the job.
async function emailTo(to: string, subject: string) {
  return vi.waitFor(() => {
    const message = enqueue.mock.calls
      .map(([, payload]) => payload)
      .find((payload) => payload.to === to && payload.subject === subject);
    if (!message) throw new Error(`no email "${subject}" to ${to}`);
    return message;
  });
}

function tokenIn(text: string): string {
  const token = /token=([^&\s]+)/.exec(text)?.[1];
  if (!token) {
    throw new Error(`no token in email: ${text}`);
  }
  return token;
}

// Requests deletion, then confirms it with the token from the emailed link.
async function deleteAccount(headers: Headers) {
  const { user } = (await auth.api.getSession({ headers })) ?? {};
  await auth.api.deleteUser({ body: {}, headers });
  const confirmation = await emailTo(user?.email ?? "", SUBJECTS.deletion);
  return auth.api.deleteUser({ body: { token: tokenIn(confirmation.text) }, headers });
}

beforeEach(() => {
  enqueue.mockClear();
});

afterAll(async () => {
  await database.current?.close();
});

describe("email change", () => {
  it("writes the new email only after the new address is verified", async () => {
    const user = await signUp("change-unverified");
    const newEmail = `new-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await auth.api.changeEmail({ body: { newEmail }, headers: user.headers });

    expect(await userRow(user.userId)).toEqual({ email: user.email });
    const verification = await emailTo(newEmail, SUBJECTS.verification);

    await auth.api.verifyEmail({ query: { token: tokenIn(verification.text) } });

    expect(await userRow(user.userId)).toEqual({ email: newEmail });
  });

  it("asks a verified user's old address to approve the change first", async () => {
    const user = await signUp("change-verified");
    await testDatabase()
      .db.update(usersTable)
      .set({ emailVerified: true })
      .where(eq(usersTable.id, user.userId));
    const newEmail = `new-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await auth.api.changeEmail({ body: { newEmail }, headers: user.headers });

    expect(await userRow(user.userId)).toEqual({ email: user.email });
    const approval = await emailTo(user.email, SUBJECTS.approval);
    expect(approval.text).toContain(newEmail);
  });
});

describe("account deletion", () => {
  it("deletes the user only after the emailed link is used", async () => {
    const user = await signUp("delete-link");

    const requested = await auth.api.deleteUser({ body: {}, headers: user.headers });

    expect(requested.message).toBe("Verification email sent");
    expect(await userRow(user.userId)).toEqual({ email: user.email });
    const confirmation = await emailTo(user.email, SUBJECTS.deletion);
    expect(confirmation.text).toContain("http://localhost:3000/account/delete?token=");

    await auth.api.deleteUser({
      body: { token: tokenIn(confirmation.text) },
      headers: user.headers
    });

    expect(await userRow(user.userId)).toBeNull();
  });

  it("refuses a sole owner of an organization with other members and names it", async () => {
    const owner = await signUp("delete-sole-owner");
    const member = await signUp("delete-sole-member");
    const organizationId = await createOrganization(owner.headers, "Acme");
    await addMember(organizationId, member.userId, "member");

    await expect(auth.api.deleteUser({ body: {}, headers: owner.headers })).rejects.toMatchObject({
      body: { code: "SOLE_OWNER_OF_SHARED_ORGANIZATION", organizationName: "Acme" }
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      enqueue.mock.calls.filter(([, payload]) => payload.subject === SUBJECTS.deletion)
    ).toEqual([]);
    expect(await userRow(owner.userId)).toEqual({ email: owner.email });
  });

  it("refuses the confirmation when an organization gained a member after the request", async () => {
    const owner = await signUp("delete-late-member");
    const member = await signUp("delete-late-joiner");
    const organizationId = await createOrganization(owner.headers, "Later");
    await auth.api.deleteUser({ body: {}, headers: owner.headers });
    const confirmation = await emailTo(owner.email, SUBJECTS.deletion);
    await addMember(organizationId, member.userId, "member");

    await expect(
      auth.api.deleteUser({
        body: { token: tokenIn(confirmation.text) },
        headers: owner.headers
      })
    ).rejects.toMatchObject({ body: { code: "SOLE_OWNER_OF_SHARED_ORGANIZATION" } });
    expect(await organizationRow(organizationId)).toEqual({ userId: owner.userId });
  });

  it("refuses a personal organization that has other members", async () => {
    const owner = await signUp("delete-personal-owner");
    const member = await signUp("delete-personal-member");
    await addMember(await personalOrganizationId(owner.userId), member.userId, "member");

    await expect(auth.api.deleteUser({ body: {}, headers: owner.headers })).rejects.toMatchObject({
      body: { code: "PERSONAL_ORGANIZATION_HAS_MEMBERS", organizationName: "Personal" }
    });
  });

  it("keeps a shared organization and its attachments, and deletes the user's own", async () => {
    const leaver = await signUp("delete-leaver");
    const coOwner = await signUp("delete-co-owner");
    const sharedId = await createOrganization(leaver.headers, "Shared");
    await addMember(sharedId, coOwner.userId, "owner");
    const personalId = await personalOrganizationId(leaver.userId);
    await testDatabase()
      .db.insert(filesTable)
      .values({
        key: `${sharedId}/report.pdf`,
        bucket: "attachments",
        originalName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadedBy: leaver.userId,
        organizationId: sharedId
      });
    await testDatabase()
      .db.update(usersTable)
      .set({ image: "https://cdn.example.com/avatar/leaver.webp" })
      .where(eq(usersTable.id, leaver.userId));

    await deleteAccount(leaver.headers);

    expect(await userRow(leaver.userId)).toBeNull();
    expect(await organizationRow(sharedId)).toEqual({ userId: coOwner.userId });
    expect(
      await testDatabase()
        .db.select({ uploadedBy: filesTable.uploadedBy, organizationId: filesTable.organizationId })
        .from(filesTable)
        .where(eq(filesTable.organizationId, sharedId))
    ).toEqual([{ uploadedBy: null, organizationId: sharedId }]);
    expect(await organizationRow(personalId)).toBeNull();
    expect(
      await testDatabase()
        .db.select({ organizationId: organizationStoragePurgesTable.organizationId })
        .from(organizationStoragePurgesTable)
        .where(eq(organizationStoragePurgesTable.organizationId, personalId))
    ).toEqual([{ organizationId: personalId }]);
    expect(
      await testDatabase()
        .db.select({ url: publicAssetPurgesTable.url })
        .from(publicAssetPurgesTable)
        .where(eq(publicAssetPurgesTable.url, "https://cdn.example.com/avatar/leaver.webp"))
    ).toEqual([{ url: "https://cdn.example.com/avatar/leaver.webp" }]);
  });
});
