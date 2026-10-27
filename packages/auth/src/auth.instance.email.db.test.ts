import { accountsTable, sessionsTable, usersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage } from "@repo/email";
import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Each test signs users up through scrypt on PGlite, which can pass vitest's
// 5 s default on a slow runner.
vi.setConfig({ testTimeout: 30_000 });

// The real auth instance on an in-process Postgres, so each email comes from
// better-auth's own routes and the stored user locale.
const SECRET = "test-secret-test-secret-test-secret-1234";
vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("WEB_APP_URL", "https://app.example.com");
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

async function signUp(label: string, name = label) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name },
    returnHeaders: true
  });
  return { email, headers: cookieHeaders(headers), userId: response.user.id };
}

async function signUpGerman(label: string) {
  const account = await signUp(label);
  await auth.api.updateUser({ body: { locale: "de" }, headers: account.headers });
  return account;
}

// Hooks enqueue after rendering, without awaiting; wait for the job.
async function emailTo(to: string, subject: string): Promise<EmailMessage> {
  return vi.waitFor(() => {
    const message = enqueue.mock.calls
      .map(([, payload]) => payload)
      .find((payload) => payload.to === to && payload.subject === subject);
    if (!message) throw new Error(`no email "${subject}" to ${to}`);
    return message;
  });
}

function subjectsTo(to: string): string[] {
  return enqueue.mock.calls.filter(([, payload]) => payload.to === to).map(([, p]) => p.subject);
}

describe("auth emails on the real auth instance", () => {
  beforeEach(() => {
    enqueue.mockReset();
    enqueue.mockResolvedValue("job-1");
  });

  afterAll(async () => {
    await testDatabase().close();
  });

  it("sends one welcome email to a new user and none on a later sign-in", async () => {
    // Anyone can sign up with another person's address before it is verified,
    // so the welcome email carries no text the sign-up form supplies.
    const { email } = await signUp("welcome", "Account locked, call 555 0100");

    const welcome = await emailTo(email, "Welcome to Kaine Forge");
    expect(welcome.text).toContain("https://app.example.com");
    expect(welcome.text).not.toContain("555 0100");
    expect(welcome.html).not.toContain("555 0100");

    await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(subjectsTo(email)).toEqual(["Welcome to Kaine Forge"]);
  });

  it("refuses a name longer than 64 characters on sign-up and on update", async () => {
    await expect(signUp("long-name", "n".repeat(65))).rejects.toMatchObject({ statusCode: 400 });

    const { headers } = await signUp("rename");
    await expect(
      auth.api.updateUser({ body: { name: "n".repeat(65) }, headers })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      auth.api.updateUser({ body: { name: "n".repeat(64) }, headers })
    ).resolves.toMatchObject({ status: true });
  });

  it("stores the locale a sign-up sends", async () => {
    const email = `signup-locale-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Signup", locale: "sr" }
    });

    await emailTo(email, "Dobro došli u Kaine Forge");
  });

  it("stores a supported locale and refuses an unsupported one", async () => {
    const { headers, userId } = await signUpGerman("locale");

    await expect(auth.api.updateUser({ body: { locale: "fr" }, headers })).rejects.toMatchObject({
      statusCode: 400
    });

    const [row] = await testDatabase()
      .db.select({ locale: usersTable.locale })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    expect(row?.locale).toBe("de");
  });

  it("sends an email one-time code in the stored language of the address", async () => {
    const { email } = await signUpGerman("otp");

    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });

    const message = await emailTo(email, "Dein Anmeldecode");
    expect(message.text).toMatch(/\d{6}/);
  });

  async function signInWithEmailCode(email: string, codeSubject = "Your sign-in code") {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = /\d{6}/.exec((await emailTo(email, codeSubject)).text)?.[0] ?? "";
    return auth.api.signInEmailOTP({ body: { email, otp } });
  }

  async function rowsOf(table: typeof accountsTable | typeof sessionsTable, userId: string) {
    return testDatabase().db.select({ id: table.id }).from(table).where(eq(table.userId, userId));
  }

  // better-auth's protection against pre-registered accounts: proving the
  // address of an unverified account removes the password and the sessions
  // from before the proof. Its cleanup lock in the verifications table is
  // keyed by a deterministic uuid.
  it("removes an unverified account's password and old sessions, and says so once", async () => {
    const { email, userId } = await signUpGerman("otp-unverified");

    const result = await signInWithEmailCode(email, "Dein Anmeldecode");

    expect(result.user).toMatchObject({ id: userId, emailVerified: true });
    expect(await rowsOf(accountsTable, userId)).toEqual([]);
    expect((await rowsOf(sessionsTable, userId)).map((row) => row.id)).toEqual([
      expect.any(String)
    ]);
    const notice = await emailTo(email, "Dein Passwort wurde entfernt");
    expect(notice.text).toContain("https://app.example.com/auth");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      subjectsTo(email).filter((subject) => subject === "Dein Passwort wurde entfernt")
    ).toHaveLength(1);
  });

  it("sends no password notice when the unverified account had no password", async () => {
    const { email, userId } = await signUp("otp-no-password");
    await testDatabase().db.delete(accountsTable).where(eq(accountsTable.userId, userId));

    await signInWithEmailCode(email);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(subjectsTo(email).filter((subject) => subject === "Your password was removed")).toEqual(
      []
    );
  });

  it("sends no password notice on an email-code sign-in to a verified account", async () => {
    const { email, userId } = await signUp("otp-verified");
    await testDatabase()
      .db.update(usersTable)
      .set({ emailVerified: true })
      .where(eq(usersTable.id, userId));

    await signInWithEmailCode(email);

    expect(await rowsOf(accountsTable, userId)).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(subjectsTo(email).filter((subject) => subject === "Your password was removed")).toEqual(
      []
    );
  });

  // better-auth sends the change-email code to the new address, which has no
  // account; the requesting session names the account and its language.
  it("sends the change-email code in the requesting user's language", async () => {
    const { email } = await signUpGerman("otp-change");
    const plugin = (auth.options.plugins ?? []).find((entry) => entry.id === "email-otp") as
      | {
          options?: {
            sendVerificationOTP?: (
              data: { email: string; otp: string; type: "change-email" },
              ctx: { context: { session: { user: { email: string } } } }
            ) => Promise<void>;
          };
        }
      | undefined;

    await plugin?.options?.sendVerificationOTP?.(
      { email: "new-address@example.com", otp: "482913", type: "change-email" },
      { context: { session: { user: { email } } } }
    );

    await emailTo("new-address@example.com", "Dein Code zum Ändern der E-Mail-Adresse");
  });

  it("alerts the user in their language after a password change", async () => {
    const { email, headers } = await signUpGerman("change-password");

    await auth.api.changePassword({
      body: { currentPassword: PASSWORD, newPassword: "Another123!Secret" },
      headers
    });

    const alert = await emailTo(email, "Dein Passwort wurde geändert");
    expect(alert.text).toContain("https://app.example.com/security");
  });

  it("alerts the user after a password reset through the emailed link", async () => {
    const { email } = await signUpGerman("reset-password");

    await auth.api.requestPasswordReset({ body: { email } });
    const reset = await emailTo(email, "Setze dein Passwort zurück");
    const token = /reset-password\/([^?\s]+)/.exec(reset.text)?.[1] ?? "";
    await auth.api.resetPassword({ body: { newPassword: "Another123!Secret", token } });

    await emailTo(email, "Dein Passwort wurde geändert");
  });

  it("alerts the user once when two-factor authentication turns on", async () => {
    const { email, headers } = await signUpGerman("two-factor");

    await auth.api.enableTwoFactor({ body: { password: PASSWORD, method: "otp" }, headers });

    await emailTo(email, "Zwei-Faktor-Authentifizierung ist aktiv");
    await auth.api.updateUser({ body: { name: "Renamed" }, headers });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(subjectsTo(email).filter((subject) => subject.startsWith("Zwei-Faktor"))).toHaveLength(
      1
    );
  });

  // The flow user.changeEmail uses (#700): the link sent to the new address
  // carries a signed change token. A browser may open it with or without the
  // old session.
  it.each([
    { label: "without a session", withSession: false },
    { label: "with the old session", withSession: true }
  ])(
    "alerts the previous address after a verified email change $label",
    async ({ withSession }) => {
      const { email, headers } = await signUpGerman("change-email");
      const newEmail = `moved-${crypto.randomUUID().slice(0, 8)}@example.com`;
      const token = await createEmailVerificationToken(SECRET, email, newEmail, 3600, {
        requestType: "change-email-verification"
      });

      await auth.api.verifyEmail({ query: { token }, ...(withSession ? { headers } : {}) });

      const alert = await emailTo(email, "Deine E-Mail-Adresse wurde geändert");
      expect(alert.text).toContain(newEmail);
      expect(subjectsTo(newEmail)).toEqual([]);
    }
  );

  it("sends an invitation in the inviter's language with the accept URL", async () => {
    const inviter = await signUpGerman("inviter");
    const invitee = `invitee-${crypto.randomUUID().slice(0, 8)}@example.com`;

    const invitation = await auth.api.createInvitation({
      body: { email: invitee, role: "member" },
      headers: inviter.headers
    });

    const message = await emailTo(invitee, "Du wurdest zu Personal eingeladen");
    expect(message.html).toContain(`https://app.example.com/invitations/${invitation.id}`);
    expect(message.text).toContain(`https://app.example.com/invitations/${invitation.id}`);
  });
});
