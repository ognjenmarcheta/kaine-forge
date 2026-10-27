// Proves both producers end in exactly one Notification per event, and that
// each channel follows the recipient's preference. The real auth instance runs
// better-auth's organization routes against an in-process Postgres with every
// migration; the real delivery stores rows there. Only the job queue is a
// fake: it records what would be sent.
import type { NotificationEvent } from "@repo/auth/notifications";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage, EmailTemplate } from "@repo/email";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationCreatedPayload } from "../../pubsub";

vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database, enqueue } = vi.hoisted(() => ({
  database: { current: null as TestDatabase | null },
  enqueue: vi.fn<(name: string, message: EmailMessage) => Promise<string>>()
}));

vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase } = await import("@repo/db/testing");
  database.current = await createTestDatabase();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({ jobQueue: { enqueue } }));

const { createAuthInstance } = await import("@repo/auth/instance");
const { setNotificationDispatcher } = await import("@repo/auth/notifications");
const { membersTable, notificationPreferencesTable, notificationsTable } =
  await import("@repo/db/schema");
const { createNotificationDelivery } = await import("./notifications.delivery");

const auth = createAuthInstance();

function db() {
  if (!database.current) {
    throw new Error("test database not created");
  }
  return database.current.db;
}

const published: NotificationCreatedPayload[] = [];
const emails: Array<{ email: EmailTemplate; locale: string | null; to: string }> = [];
const delivery = createNotificationDelivery({
  db: db(),
  publish: (payload) => published.push(payload),
  sendEmail: async (to, email, locale) => {
    emails.push({ email, locale, to });
  }
});
const deliveries: Array<Promise<void>> = [];

// Keeps each delivery's promise, so a test can wait for it to settle.
setNotificationDispatcher((event: NotificationEvent) => {
  const delivered = delivery(event);
  deliveries.push(delivered.catch(() => undefined));
  return delivered;
});

afterEach(() => {
  published.length = 0;
  emails.length = 0;
  deliveries.length = 0;
  enqueue.mockClear();
});

afterAll(async () => {
  setNotificationDispatcher(null);
  await database.current?.close();
});

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

// Creates an Organization; better-auth makes it the session's Active Organization.
async function createOrganization(headers: Headers, name: string) {
  const { headers: responseHeaders, response } = await auth.api.createOrganization({
    body: { name, slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}` },
    headers,
    returnHeaders: true
  });
  const cookies = new Map<string, string>();
  for (const pair of [
    ...(headers.get("cookie") ?? "").split("; "),
    ...responseHeaders.getSetCookie().map((entry) => entry.split(";")[0] ?? "")
  ].filter(Boolean)) {
    cookies.set(pair.split("=")[0] ?? "", pair);
  }
  return {
    headers: new Headers({ cookie: [...cookies.values()].join("; ") }),
    organizationId: response?.id ?? ""
  };
}

// Sign-up queues a welcome email too, so this picks invitation emails only.
function queuedInvitationEmails() {
  return enqueue.mock.calls
    .map(([, message]) => message)
    .filter((message) => message.subject.startsWith("You have been invited"));
}

async function addMember(organizationId: string, userId: string, role: string) {
  const [member] = await db()
    .insert(membersTable)
    .values({ organizationId, role, userId })
    .returning({ id: membersTable.id });
  return member?.id ?? "";
}

// Producers hand events off without awaiting them; this waits until every
// delivery started so far has settled.
async function settled() {
  await vi.waitFor(() => expect(deliveries.length).toBeGreaterThan(0));
  await Promise.all(deliveries);
}

async function notificationsOf(userId: string) {
  return db()
    .select({
      organizationId: notificationsTable.organizationId,
      payload: notificationsTable.payload,
      type: notificationsTable.type
    })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId));
}

async function setPreference(userId: string, type: string, inApp: boolean, email: boolean) {
  await db().insert(notificationPreferencesTable).values({ email, inApp, type, userId });
}

describe("invitation received", () => {
  it("gives an existing user one Notification and sends the invitation email once", async () => {
    const owner = await signUp("invite-owner");
    const invitee = await signUp("invitee");
    const shared = await createOrganization(owner.headers, "Acme");

    const invitation = await auth.api.createInvitation({
      body: { email: invitee.email, role: "admin" },
      headers: shared.headers
    });
    await settled();

    expect(await notificationsOf(invitee.userId)).toEqual([
      {
        organizationId: shared.organizationId,
        payload: {
          invitationId: invitation.id,
          inviterName: "invite-owner",
          organizationName: "Acme",
          role: "admin"
        },
        type: "invitation_received"
      }
    ]);
    expect(published.map((payload) => payload.userId)).toEqual([invitee.userId]);
    expect(emails).toEqual([
      {
        email: expect.objectContaining({ template: "invitation", organizationName: "Acme" }),
        locale: null,
        to: invitee.email
      }
    ]);
    // The email channel replaced the direct send, so the invitee gets one email.
    expect(queuedInvitationEmails()).toEqual([]);
  });

  it("emails an address without an account directly and stores no Notification", async () => {
    const owner = await signUp("stranger-owner");
    const shared = await createOrganization(owner.headers, "Stranger");

    await auth.api.createInvitation({
      body: { email: "no-account@example.com", role: "member" },
      headers: shared.headers
    });

    await vi.waitFor(() =>
      expect(queuedInvitationEmails().map((message) => message.to)).toEqual([
        "no-account@example.com"
      ])
    );
    expect(deliveries).toEqual([]);
  });

  it("sends no email when the invitee turned the email channel off", async () => {
    const owner = await signUp("quiet-owner");
    const invitee = await signUp("quiet-invitee");
    const shared = await createOrganization(owner.headers, "Quiet");
    await setPreference(invitee.userId, "invitation_received", true, false);

    await auth.api.createInvitation({
      body: { email: invitee.email, role: "member" },
      headers: shared.headers
    });
    await settled();

    expect(await notificationsOf(invitee.userId)).toHaveLength(1);
    expect(emails).toEqual([]);
    expect(queuedInvitationEmails()).toEqual([]);
  });
});

describe("role changed", () => {
  it("gives the member one Notification with the Organization and the new role", async () => {
    const owner = await signUp("role-owner");
    const member = await signUp("role-member");
    const shared = await createOrganization(owner.headers, "Roles");
    const memberId = await addMember(shared.organizationId, member.userId, "member");

    await auth.api.updateMemberRole({
      body: { memberId, role: "admin" },
      headers: shared.headers
    });
    await settled();

    expect(await notificationsOf(member.userId)).toEqual([
      {
        organizationId: shared.organizationId,
        payload: { organizationName: "Roles", role: "admin" },
        type: "role_changed"
      }
    ]);
    expect(emails).toEqual([
      {
        email: {
          template: "roleChanged",
          organizationName: "Roles",
          role: "admin",
          url: "http://localhost:3000/members"
        },
        locale: null,
        to: member.email
      }
    ]);
  });

  it("stores nothing in-app when the member turned the in-app channel off", async () => {
    const owner = await signUp("inbox-off-owner");
    const member = await signUp("inbox-off-member");
    const shared = await createOrganization(owner.headers, "InboxOff");
    const memberId = await addMember(shared.organizationId, member.userId, "member");
    await setPreference(member.userId, "role_changed", false, true);

    await auth.api.updateMemberRole({
      body: { memberId, role: "admin" },
      headers: shared.headers
    });
    await settled();

    expect(await notificationsOf(member.userId)).toEqual([]);
    expect(published).toEqual([]);
    expect(emails.map((sent) => sent.to)).toEqual([member.email]);
  });

  it("gives the new owner one Notification after an ownership transfer", async () => {
    const owner = await signUp("transfer-owner");
    const member = await signUp("transfer-member");
    const shared = await createOrganization(owner.headers, "Transfer");
    const memberId = await addMember(shared.organizationId, member.userId, "admin");

    const response = await auth.handler(
      new Request("http://localhost:4000/api/auth/organization/transfer-ownership", {
        method: "POST",
        headers: new Headers({
          cookie: shared.headers.get("cookie") ?? "",
          "content-type": "application/json",
          origin: "http://localhost:4000"
        }),
        body: JSON.stringify({ memberId })
      })
    );
    expect(response.status).toBe(200);
    await settled();

    expect(await notificationsOf(member.userId)).toEqual([
      {
        organizationId: shared.organizationId,
        payload: { organizationName: "Transfer", role: "owner" },
        type: "role_changed"
      }
    ]);
    expect(await notificationsOf(owner.userId)).toEqual([]);
  });

  it("completes the role change when delivery fails", async () => {
    const owner = await signUp("failing-owner");
    const member = await signUp("failing-member");
    const shared = await createOrganization(owner.headers, "Failing");
    const memberId = await addMember(shared.organizationId, member.userId, "member");
    setNotificationDispatcher(() => Promise.reject(new Error("delivery down")));

    try {
      const updated = await auth.api.updateMemberRole({
        body: { memberId, role: "admin" },
        headers: shared.headers
      });
      expect(updated).toMatchObject({ id: memberId, role: "admin" });
    } finally {
      setNotificationDispatcher((event: NotificationEvent) => {
        const delivered = delivery(event);
        deliveries.push(delivered.catch(() => undefined));
        return delivered;
      });
    }

    const [row] = await db()
      .select({ role: membersTable.role })
      .from(membersTable)
      .where(and(eq(membersTable.id, memberId), eq(membersTable.userId, member.userId)));
    expect(row?.role).toBe("admin");
  });
});
