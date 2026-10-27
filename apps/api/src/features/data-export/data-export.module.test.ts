import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  accountsTable,
  assistantConversationsTable,
  assistantMessagesTable,
  dataExportsTable,
  filesTable,
  membersTable,
  notesTable,
  organizationsTable,
  sessionsTable,
  todosTable,
  twoFactorsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import type { EmailTemplate } from "@repo/email";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDataExportJobHandler } from "./data-export.job";
import { createDataExports, type DataExportKind } from "./data-export.module";
import { createMemoryObjectStore } from "../storage/attachment.store.memory";

// Real Postgres (PGlite) and the in-memory object store; the job handler runs
// where pg-boss would call it.
let database: TestDatabase;
const ids = { alice: "", bob: "", acme: "", globex: "" };
const sentEmails: Array<{ to: string; email: EmailTemplate }> = [];
const store = createMemoryObjectStore();
const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-01T00:00:00Z");

beforeAll(async () => {
  database = await createTestDatabase();
  const db = database.db;
  const [alice, bob] = await db
    .insert(usersTable)
    .values([
      { email: "alice@example.test", name: "Alice" },
      { email: "bob@example.test", name: "Bob" }
    ])
    .returning();
  if (!alice || !bob) throw new Error("failed to seed users");
  const [acme, globex] = await db
    .insert(organizationsTable)
    .values([
      { name: "Acme", slug: "acme", userId: alice.id },
      { name: "Globex", slug: "globex", userId: bob.id }
    ])
    .returning();
  if (!acme || !globex) throw new Error("failed to seed organizations");
  Object.assign(ids, { alice: alice.id, bob: bob.id, acme: acme.id, globex: globex.id });

  await db.insert(membersTable).values([
    { organizationId: acme.id, userId: alice.id, role: "owner" },
    { organizationId: acme.id, userId: bob.id, role: "member" },
    { organizationId: globex.id, userId: bob.id, role: "owner" }
  ]);
  // Credentials the archive must never hold.
  await db.insert(accountsTable).values({
    userId: alice.id,
    accountId: alice.id,
    providerId: "credential",
    password: "scrypt-hash-of-alice",
    accessToken: "alice-oauth-access-token"
  });
  await db.insert(sessionsTable).values({
    userId: alice.id,
    token: "alice-session-token",
    expiresAt: new Date(now.getTime() + day)
  });
  await db
    .insert(twoFactorsTable)
    .values({ userId: alice.id, secret: "alice-totp-secret", backupCodes: "alice-backup-codes" });

  // One row of each kind per (author, Organization), named after both.
  const rows = [
    { userId: alice.id, organizationId: acme.id, label: "alice-acme" },
    { userId: bob.id, organizationId: acme.id, label: "bob-acme" },
    { userId: bob.id, organizationId: globex.id, label: "bob-globex" }
  ];
  for (const { userId, organizationId, label } of rows) {
    await db.insert(todosTable).values({ userId, organizationId, title: `todo-${label}` });
    await db.insert(notesTable).values({ userId, organizationId, title: `note-${label}` });
    const [conversation] = await db
      .insert(assistantConversationsTable)
      .values({ userId, organizationId, title: `conversation-${label}` })
      .returning();
    if (!conversation) throw new Error("failed to seed conversation");
    await db.insert(assistantMessagesTable).values({
      conversationId: conversation.id,
      organizationId,
      role: "user",
      content: `message-${label}`
    });
    await db.insert(filesTable).values({
      key: `${organizationId}/file-${label}`,
      bucket: "memory",
      originalName: `file-${label}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 42,
      status: "uploaded",
      uploadedBy: userId,
      organizationId
    });
  }
}, 30_000);

beforeEach(async () => {
  await database.db.delete(dataExportsTable);
  sentEmails.length = 0;
});

afterAll(async () => {
  await database.close();
});

function scopeOf(userId: string, organizationId: string, role: string) {
  return {
    membership: {
      id: `membership-${userId}`,
      permissions: resolveRolePermissions(role, []),
      role,
      userId
    },
    organizationId,
    user: { email: "", emailVerified: true, id: userId, name: "", twoFactorEnabled: false },
    userId
  } satisfies AuthenticatedOrganizationScope;
}

function exportsFor(userId: string, organizationId: string, role: string) {
  return createDataExports({
    db: database.db,
    store,
    requireUserId: () => userId,
    requireOrganizationScope: () => scopeOf(userId, organizationId, role),
    enqueue: () => Promise.resolve(),
    recordAuditEvent: () => Promise.resolve()
  });
}

function runJob(exportId: string): Promise<void> {
  return createDataExportJobHandler({
    db: database.db,
    store,
    archiveTtlMs: 7 * day,
    webAppUrl: "https://app.example.test",
    sendEmail: async (to, email) => void sentEmails.push({ to, email }),
    logger: { error: () => undefined, warn: () => undefined },
    now: () => now
  })({ exportId });
}

/** Requests an export, runs its job, and returns the archive's files as text. */
async function exportArchive(
  userId: string,
  organizationId: string,
  role: string,
  kind: DataExportKind
): Promise<Record<string, string>> {
  const requested = await exportsFor(userId, organizationId, role).request(kind);
  await runJob(requested.id);
  const [row] = await database.db
    .select()
    .from(dataExportsTable)
    .where(eq(dataExportsTable.id, requested.id));
  if (!row?.bucket || !row.key) throw new Error(`export not ready: ${row?.status}`);
  const bytes = await store.get({ bucket: row.bucket, key: row.key });
  if (!bytes) throw new Error("archive not stored");
  const zip = await JSZip.loadAsync(bytes);
  const files: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    files[name] = (await zip.file(name)?.async("string")) ?? "";
  }
  return files;
}

describe("data exports", () => {
  it("holds the requester's own data and no row of another user", async () => {
    const files = await exportArchive(ids.alice, ids.acme, "owner", "user");
    const archive = Object.values(files).join("\n");

    expect(Object.keys(files).sort()).toEqual([
      "assistant-conversations.json",
      "assistant-messages.json",
      "export.json",
      "files-manifest.json",
      "memberships.json",
      "notes.json",
      "profile.json",
      "todos.json"
    ]);
    for (const own of ["todo-alice-acme", "note-alice-acme", "conversation-alice-acme"]) {
      expect(archive).toContain(own);
    }
    expect(archive).toContain("message-alice-acme");
    expect(JSON.parse(files["files-manifest.json"] ?? "")).toEqual([
      expect.objectContaining({
        key: `${ids.acme}/file-alice-acme`,
        name: "file-alice-acme.pdf",
        contentType: "application/pdf",
        sizeBytes: 42
      })
    ]);
    expect(archive).not.toContain("bob-");
    expect(archive).not.toContain("bob@example.test");
  });

  it("holds only the Active Organization's data in an Organization export", async () => {
    const files = await exportArchive(ids.alice, ids.acme, "owner", "organization");
    const archive = Object.values(files).join("\n");

    for (const label of ["alice-acme", "bob-acme"]) {
      expect(archive).toContain(`todo-${label}`);
      expect(archive).toContain(`message-${label}`);
      expect(archive).toContain(`file-${label}.pdf`);
    }
    expect(archive).not.toContain("globex");
    expect(archive).not.toContain(ids.globex);
    expect(JSON.parse(files["members.json"] ?? "")).toEqual([
      expect.objectContaining({ email: "alice@example.test", role: "owner" }),
      expect.objectContaining({ email: "bob@example.test", role: "member" })
    ]);
  });

  it.each(["user", "organization"] as const)(
    "never puts a password hash, session token, or two-factor secret in a %s export",
    async (kind) => {
      const archive = Object.values(await exportArchive(ids.alice, ids.acme, "owner", kind)).join(
        "\n"
      );

      for (const secret of [
        "scrypt-hash-of-alice",
        "alice-oauth-access-token",
        "alice-session-token",
        "alice-totp-secret",
        "alice-backup-codes"
      ]) {
        expect(archive).not.toContain(secret);
      }
    }
  );

  it.each(["member", "admin"])(
    "refuses an Organization export to a %s without organization:export",
    async (role) => {
      await expect(exportsFor(ids.bob, ids.acme, role).request("organization")).rejects.toThrow(
        "permission required: organization:export"
      );
      await expect(exportsFor(ids.bob, ids.acme, role).list("organization", {})).rejects.toThrow(
        "permission required: organization:export"
      );
    }
  );

  it("allows one pending or running export of each kind per user", async () => {
    const alice = exportsFor(ids.alice, ids.acme, "owner");
    await alice.request("user");
    await alice.request("organization");

    await expect(alice.request("user")).rejects.toMatchObject({
      extensions: { code: "DATA_EXPORT_IN_PROGRESS" }
    });
  });

  it("marks the export ready, emails the requester, and lists it with its expiry", async () => {
    await exportArchive(ids.alice, ids.acme, "owner", "user");

    expect(sentEmails).toEqual([
      {
        to: "alice@example.test",
        email: {
          template: "dataExportReady",
          url: "https://app.example.test/account",
          expiresInDays: 7
        }
      }
    ]);
    const { items } = await exportsFor(ids.alice, ids.acme, "owner").list("user", {});
    expect(items).toEqual([
      expect.objectContaining({
        kind: "user",
        status: "ready",
        expiresAt: new Date(now.getTime() + 7 * day)
      })
    ]);
    expect((await exportsFor(ids.alice, ids.acme, "owner").list("organization", {})).items).toEqual(
      []
    );
  });

  it("presigns a download only for the requester's own ready export", async () => {
    await exportArchive(ids.alice, ids.acme, "owner", "organization");
    const [ready] = (await exportsFor(ids.alice, ids.acme, "owner").list("organization", {})).items;
    if (!ready) throw new Error("no export listed");

    await expect(exportsFor(ids.alice, ids.acme, "owner").downloadUrl(ready.id)).resolves.toMatch(
      new RegExp(`^memory://memory/${ids.acme}/exports/${ready.id}\\.zip\\?disposition=attachment`)
    );
    // Another owner of the same Organization did not request it.
    await expect(exportsFor(ids.bob, ids.acme, "owner").downloadUrl(ready.id)).rejects.toThrow(
      "data export not found"
    );
    // The requester's Active Organization is another one now.
    await expect(exportsFor(ids.alice, ids.globex, "owner").downloadUrl(ready.id)).rejects.toThrow(
      "data export not found"
    );
  });
});
