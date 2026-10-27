import { auditEventsTable, membersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import type { EmailMessage } from "@repo/email";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// The real auth instance on an in-process Postgres with every migration
// applied, so Custom Role rules run through better-auth's own routes.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database } = vi.hoisted(() => ({
  database: { current: null as TestDatabase | null }
}));

// Only the schema, never the real `@repo/db` index: its client throws without
// DATABASE_URL, which a fresh checkout or worktree does not have.
vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({
  jobQueue: { enqueue: vi.fn<(name: string, message: EmailMessage) => Promise<string>>() }
}));

const { createAuthInstance } = await import("./auth.instance");
const { getOrganizationMembershipProof } = await import("./auth.server.organization");

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
  const response = await auth.handler(
    new Request(`http://localhost:4000/api/auth${path}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body)
    })
  );
  const json: unknown = await response.json().catch(() => null);
  const code =
    typeof json === "object" && json !== null && "code" in json && typeof json.code === "string"
      ? json.code
      : null;
  return { code, status: response.status };
}

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

// A user who belongs to the organization with `role` and has it active.
async function joinAs(organizationId: string, label: string, role: string) {
  const user = await signUp(label);
  const [member] = await testDatabase()
    .db.insert(membersTable)
    .values({ organizationId, userId: user.userId, role })
    .returning({ id: membersTable.id });
  if (!member) {
    throw new Error("failed to add member");
  }
  return { ...user, headers: await setActive(user.headers, organizationId), memberId: member.id };
}

async function permissionsOf(organizationId: string, userId: string) {
  return (await getOrganizationMembershipProof({ organizationId, userId }))?.permissions ?? null;
}

async function roleOf(memberId: string) {
  const [member] = await testDatabase()
    .db.select({ role: membersTable.role })
    .from(membersTable)
    .where(eq(membersTable.id, memberId));
  return member?.role ?? null;
}

const EDITOR = { role: "editor", permission: { note: ["create", "update"], todo: ["create"] } };

afterAll(async () => {
  await database.current?.close();
});

describe("managing Custom Roles", () => {
  it("lets an owner create, update, and delete a Custom Role, each an Audit Event", async () => {
    const owner = await signUp("roles-owner");
    const shared = await createOrganization(owner.headers, "Roles");

    expect(await post("/organization/create-role", shared.headers, EDITOR)).toEqual({
      code: null,
      status: 200
    });
    expect(
      await post("/organization/update-role", shared.headers, {
        roleName: "editor",
        data: { permission: { note: ["create"] } }
      })
    ).toEqual({ code: null, status: 200 });
    expect(await post("/organization/delete-role", shared.headers, { roleName: "editor" })).toEqual(
      { code: null, status: 200 }
    );

    const events = await testDatabase()
      .db.select({
        action: auditEventsTable.action,
        metadata: auditEventsTable.metadata,
        targetType: auditEventsTable.targetType
      })
      .from(auditEventsTable)
      .where(
        and(
          eq(auditEventsTable.organizationId, shared.organizationId),
          inArray(auditEventsTable.action, ["role_created", "role_updated", "role_deleted"])
        )
      )
      .orderBy(asc(auditEventsTable.createdAt), asc(auditEventsTable.id));
    expect(events).toEqual([
      { action: "role_created", metadata: { name: "editor" }, targetType: "role" },
      { action: "role_updated", metadata: { name: "editor" }, targetType: "role" },
      { action: "role_deleted", metadata: { name: "editor" }, targetType: "role" }
    ]);
  });

  it("refuses an admin who tries to create a Custom Role", async () => {
    const owner = await signUp("roles-admin-owner");
    const shared = await createOrganization(owner.headers, "AdminRoles");
    const admin = await joinAs(shared.organizationId, "roles-admin", "admin");

    expect((await post("/organization/create-role", admin.headers, EDITOR)).status).toBe(403);
  });

  it.each([
    [
      "an owner-only permission",
      { organization: ["delete"] },
      "CUSTOM_ROLE_PERMISSION_NOT_ALLOWED"
    ],
    ["ownership transfer", { organization: ["transfer"] }, "CUSTOM_ROLE_PERMISSION_NOT_ALLOWED"],
    ["Custom Role editing", { ac: ["create"] }, "CUSTOM_ROLE_PERMISSION_NOT_ALLOWED"],
    ["an action outside the catalog", { todo: ["purge"] }, "CUSTOM_ROLE_PERMISSION_NOT_ALLOWED"]
  ])("refuses a Custom Role that grants %s", async (_case, permission, code) => {
    const owner = await signUp("roles-grant");
    const shared = await createOrganization(owner.headers, "Grants");

    expect(
      await post("/organization/create-role", shared.headers, { role: "lead", permission })
    ).toEqual({ code, status: 400 });
    expect(
      await post("/organization/create-role", shared.headers, {
        role: "lead",
        permission: { note: ["create"] }
      })
    ).toEqual({ code: null, status: 200 });
    expect(
      await post("/organization/update-role", shared.headers, {
        roleName: "lead",
        data: { permission }
      })
    ).toEqual({ code, status: 400 });
  });

  it.each([
    ["a built-in role name", "owner", "ROLE_NAME_IS_ALREADY_TAKEN"],
    ["a name with a comma", "editor,owner", "CUSTOM_ROLE_NAME_INVALID"],
    ["a name with capitals", "Editor", "CUSTOM_ROLE_NAME_INVALID"]
  ])("refuses %s", async (_case, role, code) => {
    const owner = await signUp("roles-name");
    const shared = await createOrganization(owner.headers, "Names");

    expect(
      await post("/organization/create-role", shared.headers, {
        role,
        permission: { note: ["create"] }
      })
    ).toEqual({ code, status: 400 });
  });

  it("refuses to rename a Custom Role", async () => {
    const owner = await signUp("roles-rename");
    const shared = await createOrganization(owner.headers, "Rename");
    await post("/organization/create-role", shared.headers, EDITOR);

    expect(
      await post("/organization/update-role", shared.headers, {
        roleName: "editor",
        data: { roleName: "writer" }
      })
    ).toEqual({ code: "CUSTOM_ROLE_RENAME_NOT_SUPPORTED", status: 400 });
  });
});

describe("assigning a Custom Role", () => {
  it("grants the member exactly its permissions, and an edit applies on the next read", async () => {
    const owner = await signUp("assign-owner");
    const shared = await createOrganization(owner.headers, "Assign");
    const member = await joinAs(shared.organizationId, "assign-member", "member");
    await post("/organization/create-role", shared.headers, EDITOR);

    expect(
      await post("/organization/update-member-role", shared.headers, {
        memberId: member.memberId,
        role: "editor"
      })
    ).toEqual({ code: null, status: 200 });
    expect(await permissionsOf(shared.organizationId, member.userId)).toEqual([
      "todo:create",
      "note:create",
      "note:update"
    ]);

    await post("/organization/update-role", shared.headers, {
      roleName: "editor",
      data: { permission: { note: ["create"] } }
    });

    expect(await permissionsOf(shared.organizationId, member.userId)).toEqual(["note:create"]);
  });

  it("refuses the owner role inside a comma-separated role", async () => {
    const owner = await signUp("assign-comma");
    const shared = await createOrganization(owner.headers, "Comma");
    const member = await joinAs(shared.organizationId, "assign-comma-member", "member");

    expect(
      await post("/organization/update-member-role", shared.headers, {
        memberId: member.memberId,
        role: "admin,owner"
      })
    ).toEqual({ code: "OWNER_ROLE_REQUIRES_TRANSFER", status: 400 });
    expect(await roleOf(member.memberId)).toBe("member");
  });

  it("refuses a role with permissions the assigning member does not hold", async () => {
    const owner = await signUp("assign-escalate");
    const shared = await createOrganization(owner.headers, "Escalate");
    await post("/organization/create-role", shared.headers, {
      role: "people",
      permission: { member: ["update"], invitation: ["create"] }
    });
    const manager = await joinAs(shared.organizationId, "assign-manager", "people");
    const member = await joinAs(shared.organizationId, "assign-target", "member");

    expect(
      await post("/organization/update-member-role", manager.headers, {
        memberId: member.memberId,
        role: "admin"
      })
    ).toEqual({ code: "ROLE_EXCEEDS_YOUR_PERMISSIONS", status: 403 });
    expect(
      await post("/organization/update-member-role", manager.headers, {
        memberId: manager.memberId,
        role: "admin"
      })
    ).toEqual({ code: "ROLE_EXCEEDS_YOUR_PERMISSIONS", status: 403 });
    expect(
      await post("/organization/invite-member", manager.headers, {
        email: "new-admin@example.com",
        role: "admin"
      })
    ).toEqual({ code: "ROLE_EXCEEDS_YOUR_PERMISSIONS", status: 403 });
    expect(await roleOf(member.memberId)).toBe("member");
  });
});

describe("Custom Role tenancy", () => {
  it("keeps a Custom Role of one Organization out of another", async () => {
    const owner = await signUp("tenancy-owner");
    const organizationA = await createOrganization(owner.headers, "TenantA");
    await post("/organization/create-role", organizationA.headers, EDITOR);
    const organizationB = await createOrganization(owner.headers, "TenantB");
    const memberB = await joinAs(organizationB.organizationId, "tenancy-member", "member");

    expect(
      await post("/organization/update-member-role", organizationB.headers, {
        memberId: memberB.memberId,
        role: "editor"
      })
    ).toEqual({ code: "ROLE_NOT_FOUND", status: 400 });
    expect(
      await post("/organization/create-role", organizationB.headers, {
        organizationId: organizationA.organizationId,
        ...EDITOR
      })
    ).toEqual({ code: "ACTIVE_ORGANIZATION_MISMATCH", status: 403 });

    // A member row naming Organization A's role grants nothing in Organization B.
    const stray = await joinAs(organizationB.organizationId, "tenancy-stray", "editor");
    expect(await permissionsOf(organizationB.organizationId, stray.userId)).toEqual([]);
  });
});
