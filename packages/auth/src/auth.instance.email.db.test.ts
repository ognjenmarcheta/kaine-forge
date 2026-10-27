import { usersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage } from "@repo/email";
import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

async function signUp(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: label },
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
    const { email } = await signUp("welcome");

    const welcome = await emailTo(email, "Welcome to Kaine Forge");
    expect(welcome.text).toContain("https://app.example.com");

    await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(subjectsTo(email)).toEqual(["Welcome to Kaine Forge"]);
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
