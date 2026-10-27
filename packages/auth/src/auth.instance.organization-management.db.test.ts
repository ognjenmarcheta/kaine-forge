import { auditEventsTable, invitationsTable, membersTable, organizationsTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { createHmac } from "node:crypto";
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
const { runWithAuditRequest } = await import("./auth.audit");

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

async function auditEventsOf(where: SQL | undefined) {
  return testDatabase()
    .db.select({
      action: auditEventsTable.action,
      actorUserId: auditEventsTable.actorUserId,
      metadata: auditEventsTable.metadata,
      organizationId: auditEventsTable.organizationId,
      targetId: auditEventsTable.targetId,
      targetType: auditEventsTable.targetType
    })
    .from(auditEventsTable)
    .where(where)
    .orderBy(asc(auditEventsTable.createdAt), asc(auditEventsTable.id));
}

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the secret in an otpauth:// URI.
function totpCode(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get("secret") ?? "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "")]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
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

describe("creating an organization", () => {
  it("makes the new organization active in the session cookie", async () => {
    const owner = await signUp("create-owner");

    const response = await post("/organization/create", owner.headers, {
      name: "Created",
      slug: `created-${crypto.randomUUID().slice(0, 8)}`
    });
    expect(response.status).toBe(200);
    const created: unknown = await response.json();
    const createdId =
      typeof created === "object" && created !== null && "id" in created ? created.id : null;

    expect(createdId).toEqual(expect.any(String));
    expect(await activeOrganizationId(mergeCookies(owner.headers, response.headers))).toBe(
      createdId
    );
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

describe("audit events", () => {
  it("records each organization action with its actor, target, and metadata", async () => {
    const owner = await signUp("audit-owner");
    const shared = await createOrganization(owner.headers, "Audited");
    const invitee = await signUp("audit-invitee");
    const leaver = await signUp("audit-leaver");
    const removed = await signUp("audit-removed");

    const invitation = await auth.api.createInvitation({
      body: { email: invitee.email, role: "member" },
      headers: shared.headers
    });
    await post("/organization/accept-invitation", invitee.headers, {
      invitationId: invitation.id
    });
    const [inviteeMember] = await testDatabase()
      .db.select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.organizationId, shared.organizationId),
          eq(membersTable.userId, invitee.userId)
        )
      );
    const inviteeMemberId = inviteeMember?.id ?? "";
    await post("/organization/update-member-role", shared.headers, {
      memberId: inviteeMemberId,
      role: "admin"
    });
    await post("/organization/update", shared.headers, { data: { name: "Audited Renamed" } });
    const revoked = await auth.api.createInvitation({
      body: { email: "revoked@example.com", role: "admin" },
      headers: shared.headers
    });
    await post("/organization/cancel-invitation", shared.headers, { invitationId: revoked.id });
    const leaverMemberId = await addMember(shared.organizationId, leaver.userId, "member");
    await post("/organization/leave", await setActive(leaver.headers, shared.organizationId), {});
    const removedMemberId = await addMember(shared.organizationId, removed.userId, "member");
    await post("/organization/remove-member", shared.headers, {
      memberIdOrEmail: removedMemberId
    });
    await post("/organization/transfer-ownership", shared.headers, {
      memberId: inviteeMemberId
    });
    await post("/organization/delete", await setActive(invitee.headers, shared.organizationId), {});

    expect(await auditEventsOf(eq(auditEventsTable.organizationId, shared.organizationId))).toEqual(
      [
        {
          action: "member_invited",
          actorUserId: owner.userId,
          metadata: { email: invitee.email, role: "member" },
          organizationId: shared.organizationId,
          targetId: invitation.id,
          targetType: "invitation"
        },
        {
          action: "member_joined",
          actorUserId: invitee.userId,
          metadata: { email: invitee.email, role: "member" },
          organizationId: shared.organizationId,
          targetId: inviteeMemberId,
          targetType: "member"
        },
        {
          action: "member_role_changed",
          actorUserId: owner.userId,
          metadata: { email: invitee.email, role: "admin" },
          organizationId: shared.organizationId,
          targetId: inviteeMemberId,
          targetType: "member"
        },
        {
          action: "organization_renamed",
          actorUserId: owner.userId,
          metadata: { name: "Audited Renamed" },
          organizationId: shared.organizationId,
          targetId: shared.organizationId,
          targetType: "organization"
        },
        {
          action: "member_invited",
          actorUserId: owner.userId,
          metadata: { email: "revoked@example.com", role: "admin" },
          organizationId: shared.organizationId,
          targetId: revoked.id,
          targetType: "invitation"
        },
        {
          action: "invitation_revoked",
          actorUserId: owner.userId,
          metadata: { email: "revoked@example.com" },
          organizationId: shared.organizationId,
          targetId: revoked.id,
          targetType: "invitation"
        },
        {
          action: "member_left",
          actorUserId: leaver.userId,
          metadata: { role: "member" },
          organizationId: shared.organizationId,
          targetId: leaverMemberId,
          targetType: "member"
        },
        {
          action: "member_removed",
          actorUserId: owner.userId,
          metadata: { email: removed.email, role: "member" },
          organizationId: shared.organizationId,
          targetId: removedMemberId,
          targetType: "member"
        },
        {
          action: "ownership_transferred",
          actorUserId: owner.userId,
          metadata: { email: invitee.email },
          organizationId: shared.organizationId,
          targetId: inviteeMemberId,
          targetType: "member"
        },
        {
          action: "organization_deleted",
          actorUserId: invitee.userId,
          metadata: { name: "Audited Renamed" },
          organizationId: shared.organizationId,
          targetId: shared.organizationId,
          targetType: "organization"
        }
      ]
    );
  });

  it("records two-factor and password changes as user-level events", async () => {
    const user = await signUp("audit-account");
    const password = "Secret123!Secret";

    const enabled = await auth.api.enableTwoFactor({
      body: { password },
      headers: user.headers
    });
    const totpURI = "totpURI" in enabled ? enabled.totpURI : "";
    const verified = await post("/two-factor/verify-totp", user.headers, {
      code: totpCode(totpURI)
    });
    // Turning two-factor on or off replaces the session.
    const enabledHeaders = mergeCookies(user.headers, verified.headers);
    const disabled = await post("/two-factor/disable", enabledHeaders, { password });
    const changed = await post("/change-password", mergeCookies(enabledHeaders, disabled.headers), {
      currentPassword: password,
      newPassword: "Changed123!Changed",
      revokeOtherSessions: true
    });
    expect([verified.status, disabled.status, changed.status]).toEqual([200, 200, 200]);

    const userLevel = { actorUserId: user.userId, metadata: {}, organizationId: null };
    expect(
      await auditEventsOf(
        and(eq(auditEventsTable.actorUserId, user.userId), isNull(auditEventsTable.organizationId))
      )
    ).toEqual([
      { ...userLevel, action: "two_factor_enabled", targetId: user.userId, targetType: "user" },
      { ...userLevel, action: "two_factor_disabled", targetId: user.userId, targetType: "user" },
      { ...userLevel, action: "password_changed", targetId: user.userId, targetType: "user" }
    ]);
  });

  it("stores the request's IP address and user agent", async () => {
    const owner = await signUp("audit-request");
    const shared = await createOrganization(owner.headers, "Request");

    await runWithAuditRequest({ ipAddress: "203.0.113.7", userAgent: "audit-test/1.0" }, () =>
      post("/organization/update", shared.headers, { data: { name: "Request Renamed" } })
    );

    const [event] = await testDatabase()
      .db.select({ ipAddress: auditEventsTable.ipAddress, userAgent: auditEventsTable.userAgent })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.organizationId, shared.organizationId));
    expect(event).toEqual({ ipAddress: "203.0.113.7", userAgent: "audit-test/1.0" });
  });

  it("logs a failed audit write and still completes the action", async () => {
    const owner = await signUp("audit-failure");
    const shared = await createOrganization(owner.headers, "Failure");
    const logger = { error: vi.fn() };
    await testDatabase().client.exec("ALTER TABLE audit_events RENAME TO audit_events_away;");

    let status = 0;
    try {
      const response = await runWithAuditRequest({ ipAddress: null, logger, userAgent: null }, () =>
        post("/organization/update", shared.headers, { data: { name: "Still Renamed" } })
      );
      status = response.status;
    } finally {
      await testDatabase().client.exec("ALTER TABLE audit_events_away RENAME TO audit_events;");
    }

    expect(status).toBe(200);
    const [organization] = await testDatabase()
      .db.select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, shared.organizationId));
    expect(organization?.name).toBe("Still Renamed");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization_renamed" }),
      "audit event write failed"
    );
  });
});
