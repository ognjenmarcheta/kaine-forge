import {
  auditEventsTable,
  passkeysTable,
  sessionsTable,
  usersTable,
  verificationsTable
} from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage } from "@repo/email";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Each test signs users up through scrypt on PGlite, which can pass vitest's
// 5 s default on a slow runner.
vi.setConfig({ testTimeout: 30_000 });

// The real auth instance on an in-process Postgres: magic links and passkeys
// run through better-auth's own routes.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("WEB_APP_URL", "https://app.example.com");
vi.stubEnv("API_CORS_ORIGINS", "https://app.example.com");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database, enqueue } = vi.hoisted(() => ({
  database: { current: null as TestDatabase | null },
  enqueue: vi.fn<(name: string, message: EmailMessage) => Promise<string>>()
}));

// Only the schema, never the real `@repo/db` index: its client throws without
// DATABASE_URL, which a fresh checkout or worktree does not have.
vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({ jobQueue: { enqueue } }));

const { createAuthInstance } = await import("./auth.instance");

const auth = createAuthInstance();
const PASSWORD = "Secret123!Secret";
const WEB_APP = "https://app.example.com";
const MAGIC_LINK_SUBJECT = "Your sign-in link";

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

function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function signUp(label: string) {
  const email = uniqueEmail(label);
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: label },
    returnHeaders: true
  });
  return { email, headers: cookieHeaders(headers), userId: response.user.id };
}

function requestMagicLink(email: string) {
  return auth.api.signInMagicLink({
    body: {
      email,
      callbackURL: `${WEB_APP}/dashboard`,
      errorCallbackURL: `${WEB_APP}/auth?magicLinkError=1`
    },
    headers: new Headers()
  });
}

// Hooks enqueue after rendering, without awaiting; wait for the job.
async function magicLinkTo(email: string): Promise<URL> {
  const message = await vi.waitFor(() => {
    const found = enqueue.mock.calls
      .map(([, payload]) => payload)
      .find((payload) => payload.to === email && payload.subject === MAGIC_LINK_SUBJECT);
    if (!found) throw new Error(`no magic link to ${email}`);
    return found;
  });
  const url = /http:\/\/localhost:4000\/api\/auth\/magic-link\/verify\?\S+/.exec(message.text)?.[0];
  if (!url) throw new Error("magic link email carries no link");
  return new URL(url);
}

// The browser opens the emailed link on the API, which redirects to the web app.
async function openMagicLink(link: URL): Promise<URL> {
  const response = await auth.api.magicLinkVerify({
    query: {
      token: link.searchParams.get("token") ?? "",
      callbackURL: link.searchParams.get("callbackURL") ?? "",
      errorCallbackURL: link.searchParams.get("errorCallbackURL") ?? ""
    },
    headers: new Headers(),
    asResponse: true
  });
  return new URL(response.headers.get("location") ?? "");
}

async function sessionCountOf(userId: string): Promise<number> {
  const rows = await testDatabase()
    .db.select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId));
  return rows.length;
}

async function insertPasskey(userId: string, name: string): Promise<string> {
  const [row] = await testDatabase()
    .db.insert(passkeysTable)
    .values({
      name,
      userId,
      publicKey: "cHVibGljLWtleQ",
      credentialID: crypto.randomUUID(),
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal"
    })
    .returning({ id: passkeysTable.id });
  if (!row) throw new Error("passkey not inserted");
  return row.id;
}

afterAll(async () => {
  await testDatabase().close();
});

describe("magic-link sign-in", () => {
  beforeEach(() => {
    enqueue.mockReset();
    enqueue.mockResolvedValue("job-1");
  });

  it("answers an unknown email exactly like a known one and emails only the account", async () => {
    const { email } = await signUp("known");
    const unknown = uniqueEmail("unknown");

    const known = await requestMagicLink(email);
    const missing = await requestMagicLink(unknown);

    expect(missing).toEqual(known);
    expect(known).toEqual({ status: true });
    await magicLinkTo(email);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(enqueue.mock.calls.filter(([, payload]) => payload.to === unknown)).toEqual([]);
  });

  it("opens the web app signed in, in the user's Active Organization", async () => {
    const { email, userId } = await signUp("link-sign-in");
    await requestMagicLink(email);

    const location = await openMagicLink(await magicLinkTo(email));

    expect(location.toString()).toBe(`${WEB_APP}/dashboard`);
    const [session] = await testDatabase()
      .db.select({ activeOrganizationId: sessionsTable.activeOrganizationId })
      .from(sessionsTable)
      .where(eq(sessionsTable.userId, userId));
    expect(session?.activeOrganizationId).toEqual(expect.any(String));
  });

  it("signs in with one use of a link only", async () => {
    const { email, userId } = await signUp("single-use");
    await requestMagicLink(email);
    const link = await magicLinkTo(email);
    await openMagicLink(link);
    const sessions = await sessionCountOf(userId);

    const second = await openMagicLink(link);

    expect(second.pathname).toBe("/auth");
    expect(second.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(await sessionCountOf(userId)).toBe(sessions);
  });

  it("refuses an expired link and creates no session", async () => {
    const { email, userId } = await signUp("expired");
    await requestMagicLink(email);
    const link = await magicLinkTo(email);
    await testDatabase()
      .db.update(verificationsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(
        and(
          like(verificationsTable.identifier, "magic-link:%"),
          like(verificationsTable.value, `%${email}%`)
        )
      );
    const sessions = await sessionCountOf(userId);

    const location = await openMagicLink(link);

    expect(location.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(await sessionCountOf(userId)).toBe(sessions);
  });

  it("stores only a hash of the emailed token", async () => {
    const { email } = await signUp("hashed");
    await requestMagicLink(email);
    const token = (await magicLinkTo(email)).searchParams.get("token") ?? "";

    const rows = await testDatabase()
      .db.select({ identifier: verificationsTable.identifier })
      .from(verificationsTable)
      .where(like(verificationsTable.value, `%${email}%`));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).not.toContain(token);
  });

  // Accounts are created only through the sign-up form (disableSignUp): a
  // link for an address that has no account by the time it is opened signs
  // nobody up.
  it("creates no account when the link's address has no account", async () => {
    const { email, userId } = await signUp("no-signup");
    await requestMagicLink(email);
    const link = await magicLinkTo(email);
    await testDatabase()
      .db.update(usersTable)
      .set({ email: uniqueEmail("moved") })
      .where(eq(usersTable.id, userId));

    const location = await openMagicLink(link);

    expect(location.searchParams.get("error")).toBe("new_user_signup_disabled");
    const users = await testDatabase()
      .db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    expect(users).toEqual([]);
  });

  // ADR 0015: two-factor challenges password sign-in only; a magic link, like
  // an email code, already proves control of the address.
  it("is not challenged by two-factor authentication", async () => {
    const { email, headers, userId } = await signUp("two-factor-link");
    await auth.api.enableTwoFactor({ body: { password: PASSWORD, method: "otp" }, headers });
    // Verified, so the sign-in keeps the account's other sessions.
    await testDatabase()
      .db.update(usersTable)
      .set({ emailVerified: true })
      .where(eq(usersTable.id, userId));
    const sessions = await sessionCountOf(userId);
    await requestMagicLink(email);

    const location = await openMagicLink(await magicLinkTo(email));

    expect(location.toString()).toBe(`${WEB_APP}/dashboard`);
    expect(await sessionCountOf(userId)).toBe(sessions + 1);
  });
});

describe("passkeys", () => {
  it("offers registration for the web app's relying party", async () => {
    const { headers } = await signUp("rp");

    const options = await auth.api.generatePasskeyRegistrationOptions({ headers });

    expect(options.rp).toEqual({ id: "app.example.com", name: "Kaine Forge" });
  });

  it("lists only the signed-in user's passkeys", async () => {
    const owner = await signUp("passkey-owner");
    const other = await signUp("passkey-other");
    await insertPasskey(owner.userId, "Laptop");
    await insertPasskey(other.userId, "Phone");

    const passkeys = await auth.api.listPasskeys({ headers: owner.headers });

    expect(passkeys.map((passkey) => passkey.name)).toEqual(["Laptop"]);
  });

  it("refuses to delete another user's passkey and keeps it", async () => {
    const owner = await signUp("delete-owner");
    const attacker = await signUp("delete-attacker");
    const passkeyId = await insertPasskey(owner.userId, "Laptop");

    await expect(
      auth.api.deletePasskey({ body: { id: passkeyId }, headers: attacker.headers })
    ).rejects.toMatchObject({ statusCode: 401 });

    const rows = await testDatabase()
      .db.select({ id: passkeysTable.id })
      .from(passkeysTable)
      .where(eq(passkeysTable.id, passkeyId));
    expect(rows).toHaveLength(1);
  });

  it("deletes the user's own passkey and records an Audit Event", async () => {
    const owner = await signUp("delete-own");
    const passkeyId = await insertPasskey(owner.userId, "Laptop");

    await auth.api.deletePasskey({ body: { id: passkeyId }, headers: owner.headers });

    const rows = await testDatabase()
      .db.select({ id: passkeysTable.id })
      .from(passkeysTable)
      .where(eq(passkeysTable.id, passkeyId));
    expect(rows).toEqual([]);
    const events = await testDatabase()
      .db.select({
        action: auditEventsTable.action,
        actorUserId: auditEventsTable.actorUserId,
        metadata: auditEventsTable.metadata,
        organizationId: auditEventsTable.organizationId
      })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.targetId, passkeyId));
    expect(events).toEqual([
      {
        action: "passkey_removed",
        actorUserId: owner.userId,
        metadata: { name: "Laptop" },
        organizationId: null
      }
    ]);
  });
});
