import { invitationsTable, membersTable, organizationsTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// The real auth instance on an in-process Postgres with every migration
// applied, so the organization guards run through better-auth's own routes.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
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

const { createAuthInstance } = await import("./auth.instance");

const auth = createAuthInstance();

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

// Later Set-Cookie values replace earlier ones of the same name, as a browser would.
function mergeCookies(current: Headers, response: Headers): Headers {
  const jar = new Map<string, string>();
  for (const pair of (current.get("cookie") ?? "").split("; ").filter(Boolean)) {
    const [name = ""] = pair.split("=");
    jar.set(name, pair);
  }
  for (const entry of response.getSetCookie()) {
    const pair = entry.split(";")[0] ?? "";
    const [name = ""] = pair.split("=");
    jar.set(name, pair);
  }
  return new Headers({ cookie: [...jar.values()].join("; ") });
}

async function signUp(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "Secret123!Secret", name: label },
    returnHeaders: true
  });
  return { email, headers: cookieHeaders(headers), userId: response.user.id };
}

async function activeOrganizationId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.session.activeOrganizationId ?? null;
}

async function setActive(headers: Headers, organizationId: string): Promise<Headers> {
  const { headers: responseHeaders } = await auth.api.setActiveOrganization({
    body: { organizationId },
    headers,
    returnHeaders: true
  });
  return mergeCookies(headers, responseHeaders);
}

// A browser-shaped request through the HTTP handler, so body validation and
// the hooks run as they do for the web app.
async function post(path: string, headers: Headers, body: Record<string, unknown>) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set("origin", "http://localhost:4000");
  return auth.handler(
    new Request(`http://localhost:4000/api/auth${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body)
    })
  );
}

// Creates an organization and makes it the session's Active Organization.
async function createOrganization(headers: Headers, name: string) {
  const response = await auth.api.createOrganization({
    body: { name, slug: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}` },
    headers
  });
  if (!response) {
    throw new Error("expected organization to be created");
  }
  return { headers: await setActive(headers, response.id), organizationId: response.id };
}

async function addMember(organizationId: string, userId: string, role: string) {
  const [member] = await testDatabase()
    .db.insert(membersTable)
    .values({ organizationId, userId, role })
    .returning({ id: membersTable.id });
  if (!member) {
    throw new Error("failed to add member");
  }
  return member.id;
}

async function roleOf(organizationId: string, userId: string) {
  const [member] = await testDatabase()
    .db.select({ role: membersTable.role })
    .from(membersTable)
    .where(and(eq(membersTable.organizationId, organizationId), eq(membersTable.userId, userId)));
  return member?.role ?? null;
}

async function organizationOwnerColumn(organizationId: string) {
  const [organization] = await testDatabase()
    .db.select({ userId: organizationsTable.userId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
  return organization?.userId ?? null;
}

afterAll(async () => {
  await database.current?.close();
});

describe("personal organization guard", () => {
  it("refuses to delete a personal organization", async () => {
    const owner = await signUp("delete-personal");
    const personalId = await activeOrganizationId(owner.headers);

    await expect(
      auth.api.deleteOrganization({
        body: { organizationId: personalId ?? "" },
        headers: owner.headers
      })
    ).rejects.toMatchObject({ body: { code: "PERSONAL_ORGANIZATION_CANNOT_BE_DELETED" } });
    expect(await roleOf(personalId ?? "", owner.userId)).toBe("owner");
  });

  it("refuses to let a member leave a personal organization", async () => {
    const owner = await signUp("leave-personal");
    const personalId = (await activeOrganizationId(owner.headers)) ?? "";
    // A second owner, so better-auth's only-owner rule does not decide it.
    const coOwner = await signUp("leave-personal-co");
    await addMember(personalId, coOwner.userId, "owner");

    await expect(
      auth.api.leaveOrganization({ body: { organizationId: personalId }, headers: owner.headers })
    ).rejects.toMatchObject({ body: { code: "PERSONAL_ORGANIZATION_CANNOT_BE_LEFT" } });
    expect(await roleOf(personalId, owner.userId)).toBe("owner");
  });
});

describe("active organization actions", () => {
  it("refuses an organization id other than the session's active organization", async () => {
    const owner = await signUp("mismatch");
    const other = await createOrganization(owner.headers, "Other");
    const target = await createOrganization(other.headers, "Target");

    await expect(
      auth.api.deleteOrganization({
        body: { organizationId: other.organizationId },
        headers: target.headers
      })
    ).rejects.toMatchObject({ body: { code: "ACTIVE_ORGANIZATION_MISMATCH" } });
    expect(await roleOf(other.organizationId, owner.userId)).toBe("owner");
  });

  it("switches the session to another organization after leaving the active one", async () => {
    const owner = await signUp("leave-owner");
    const shared = await createOrganization(owner.headers, "Shared");
    const memberAccount = await signUp("leave-member");
    await addMember(shared.organizationId, memberAccount.userId, "member");
    const memberHeaders = await setActive(memberAccount.headers, shared.organizationId);

    // The web app sends no organization id; the server takes the active one.
    const response = await post("/organization/leave", memberHeaders, {});
    expect(response.status).toBe(200);

    const nextActive = await activeOrganizationId(mergeCookies(memberHeaders, response.headers));
    expect(nextActive).not.toBe(shared.organizationId);
    expect(await roleOf(nextActive ?? "", memberAccount.userId)).toBe("owner");
  });
});

describe("owner role", () => {
  it("refuses an invitation with the owner role and writes no invitation", async () => {
    const owner = await signUp("invite-owner");
    const shared = await createOrganization(owner.headers, "OwnerInvite");

    await expect(
      auth.api.createInvitation({
        body: { email: "second-owner@example.com", role: "owner" },
        headers: shared.headers
      })
    ).rejects.toMatchObject({ body: { code: "OWNER_ROLE_REQUIRES_TRANSFER" } });

    const invitations = await testDatabase()
      .db.select({ id: invitationsTable.id })
      .from(invitationsTable)
      .where(eq(invitationsTable.organizationId, shared.organizationId));
    expect(invitations).toEqual([]);
  });
});

describe("accepting an invitation", () => {
  it("makes the invitation's organization active in the session cookie", async () => {
    const owner = await signUp("accept-owner");
    const shared = await createOrganization(owner.headers, "Joined");
    const invitee = await signUp("accept-invitee");
    const invitation = await auth.api.createInvitation({
      body: { email: invitee.email, role: "member" },
      headers: shared.headers
    });

    const response = await post("/organization/accept-invitation", invitee.headers, {
      invitationId: invitation.id
    });
    expect(response.status).toBe(200);

    expect(await activeOrganizationId(mergeCookies(invitee.headers, response.headers))).toBe(
      shared.organizationId
    );
  });
});

describe("transfer ownership", () => {
  it("makes the target owner, the caller admin, and moves organizations.user_id", async () => {
    const owner = await signUp("transfer-owner");
    const shared = await createOrganization(owner.headers, "Handover");
    const target = await signUp("transfer-target");
    const targetMemberId = await addMember(shared.organizationId, target.userId, "member");

    await auth.api.transferOrganizationOwnership({
      body: { memberId: targetMemberId },
      headers: shared.headers
    });

    expect(await roleOf(shared.organizationId, target.userId)).toBe("owner");
    expect(await roleOf(shared.organizationId, owner.userId)).toBe("admin");
    expect(await organizationOwnerColumn(shared.organizationId)).toBe(target.userId);
  });

  it("changes nothing when a write inside the transfer fails", async () => {
    const owner = await signUp("atomic-owner");
    const shared = await createOrganization(owner.headers, "Atomic");
    const target = await signUp("atomic-target");
    const targetMemberId = await addMember(shared.organizationId, target.userId, "member");
    // The last write of the transfer, the organizations.user_id move, fails.
    await testDatabase().client.exec(`
      CREATE FUNCTION reject_owner_move() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'owner move rejected'; END; $$;
      CREATE TRIGGER reject_owner_move BEFORE UPDATE OF user_id ON organizations
        FOR EACH ROW WHEN (OLD.id = '${shared.organizationId}') EXECUTE FUNCTION reject_owner_move();
    `);

    try {
      await expect(
        auth.api.transferOrganizationOwnership({
          body: { memberId: targetMemberId },
          headers: shared.headers
        })
      ).rejects.toThrow(/update "organizations"/);
    } finally {
      await testDatabase().client.exec(
        "DROP TRIGGER reject_owner_move ON organizations; DROP FUNCTION reject_owner_move();"
      );
    }

    expect(await roleOf(shared.organizationId, owner.userId)).toBe("owner");
    expect(await roleOf(shared.organizationId, target.userId)).toBe("member");
    expect(await organizationOwnerColumn(shared.organizationId)).toBe(owner.userId);
  });

  it("refuses an admin, and a personal organization", async () => {
    const owner = await signUp("transfer-refused");
    const personalId = (await activeOrganizationId(owner.headers)) ?? "";
    const admin = await signUp("transfer-admin");
    const adminMemberId = await addMember(personalId, admin.userId, "admin");

    await expect(
      auth.api.transferOrganizationOwnership({
        body: { memberId: adminMemberId },
        headers: owner.headers
      })
    ).rejects.toMatchObject({ body: { code: "PERSONAL_ORGANIZATION_CANNOT_BE_TRANSFERRED" } });

    const shared = await createOrganization(owner.headers, "AdminTry");
    const sharedAdminMemberId = await addMember(shared.organizationId, admin.userId, "admin");

    await expect(
      auth.api.transferOrganizationOwnership({
        body: { memberId: sharedAdminMemberId },
        headers: await setActive(admin.headers, shared.organizationId)
      })
    ).rejects.toMatchObject({ body: { code: "ONLY_AN_OWNER_CAN_TRANSFER_OWNERSHIP" } });
    expect(await organizationOwnerColumn(shared.organizationId)).toBe(owner.userId);
  });
});
