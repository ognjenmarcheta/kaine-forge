import type { AuditEventInput } from "@repo/auth/audit";
import { resolveRolePermissions } from "@repo/auth/permissions";
import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  accountsTable,
  apiKeysTable,
  assistantConversationsTable,
  assistantMessagesTable,
  dataExportsTable,
  filesTable,
  invitationsTable,
  membersTable,
  notesTable,
  organizationsTable,
  passkeysTable,
  sessionsTable,
  todosTable,
  twoFactorsTable,
  usersTable,
  webhookEndpointsTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import type { Database } from "@repo/db/types";
import type { EmailTemplate } from "@repo/email";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import JSZip from "jszip";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createDataExportJobHandler } from "./data-export.job";
import { createDataExports, type DataExportKind } from "./data-export.module";
import { createMemoryObjectStore } from "../storage/attachment.store.memory";

// Real Postgres (PGlite) and the in-memory object store; the job handler runs
// where pg-boss would call it.
let database: TestDatabase;
const ids = { alice: "", bob: "", acme: "", globex: "" };
const sentEmails: Array<{ to: string; email: EmailTemplate }> = [];
const audited: AuditEventInput[] = [];
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
  const [acme, globex, initech] = await db
    .insert(organizationsTable)
    .values([
      { name: "Acme", slug: "acme", userId: alice.id },
      { name: "Globex", slug: "globex", userId: bob.id },
      { name: "Initech", slug: "initech", userId: bob.id }
    ])
    .returning();
  if (!acme || !globex || !initech) throw new Error("failed to seed organizations");
  Object.assign(ids, { alice: alice.id, bob: bob.id, acme: acme.id, globex: globex.id });

  await db.insert(membersTable).values([
    { organizationId: acme.id, userId: alice.id, role: "owner" },
    { organizationId: acme.id, userId: bob.id, role: "member" },
    { organizationId: globex.id, userId: bob.id, role: "owner" },
    // Alice left Initech: her rows there stay with Initech.
    { organizationId: initech.id, userId: bob.id, role: "owner" }
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
  await db.insert(apiKeysTable).values({
    organizationId: acme.id,
    name: "acme-key",
    key: "acme-api-key-hash",
    metadata: JSON.stringify({ createdBy: alice.id })
  });
  await db.insert(webhookEndpointsTable).values({
    organizationId: acme.id,
    url: "https://hooks.example.com/acme",
    secret: "whsec_acme-signing-secret",
    eventTypes: ["todo:created"]
  });
  await db.insert(passkeysTable).values({
    userId: alice.id,
    name: "alice-laptop",
    publicKey: "alice-passkey-public-key",
    credentialID: "alice-passkey-credential-id",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true
  });

  // One row of each kind per (author, Organization), named after both.
  const rows = [
    { userId: alice.id, organizationId: acme.id, label: "alice-acme" },
    { userId: bob.id, organizationId: acme.id, label: "bob-acme" },
    { userId: bob.id, organizationId: globex.id, label: "bob-globex" },
    { userId: alice.id, organizationId: initech.id, label: "alice-initech" }
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
      content: `message-${label}`,
      // A tool result can quote what other members wrote.
      toolActions: [{ tool: "listNotes", result: `tool-result-quoting-note-of-${label}` }]
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
  audited.length = 0;
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
    recordAuditEvent: async (event) => void audited.push(event)
  });
}

interface JobOptions {
  db?: Database;
  maxArchiveBytes?: number;
  pageSize?: number;
}

function runJob(exportId: string, { db = database.db, ...limits }: JobOptions = {}): Promise<void> {
  return createDataExportJobHandler({
    db,
    store,
    archiveTtlMs: 7 * day,
    ...limits,
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
  kind: DataExportKind,
  jobOptions?: JobOptions
): Promise<Record<string, string>> {
  const requested = await exportsFor(userId, organizationId, role).request(kind);
  await runJob(requested.id, jobOptions);
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

  it("holds no row from an Organization the requester left", async () => {
    const archive = Object.values(await exportArchive(ids.alice, ids.acme, "owner", "user")).join(
      "\n"
    );

    expect(archive).toContain("todo-alice-acme");
    expect(archive).not.toContain("alice-initech");
    expect(archive).not.toContain("Initech");
  });

  it("holds no assistant tool result, which can quote other members' content", async () => {
    const files = await exportArchive(ids.alice, ids.acme, "owner", "user");

    expect(files["assistant-messages.json"]).toContain("message-alice-acme");
    expect(Object.values(files).join("\n")).not.toContain("tool-result-quoting");
  });

  it("holds only the Active Organization's shared data in an Organization export", async () => {
    const files = await exportArchive(ids.alice, ids.acme, "owner", "organization");
    const archive = Object.values(files).join("\n");

    expect(Object.keys(files).sort()).toEqual([
      "export.json",
      "files-manifest.json",
      "invitations.json",
      "members.json",
      "notes.json",
      "organization.json",
      "roles.json",
      "todos.json"
    ]);
    for (const label of ["alice-acme", "bob-acme"]) {
      expect(archive).toContain(`todo-${label}`);
      expect(archive).toContain(`file-${label}.pdf`);
    }
    // Assistant conversations are private to their author, the owner's own
    // included; each member exports theirs with a user export.
    expect(archive).not.toContain("conversation-");
    expect(archive).not.toContain("message-");
    expect(archive).not.toContain("globex");
    expect(archive).not.toContain(ids.globex);
    // Both joined in one insert: rows with an equal joinedAt come in id order.
    const members: unknown = JSON.parse(files["members.json"] ?? "");
    expect(members).toHaveLength(2);
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "alice@example.test", role: "owner" }),
        expect.objectContaining({ email: "bob@example.test", role: "member" })
      ])
    );
    expect(files["invitations.json"]).toBe("[]\n");
  });

  it.each(["user", "organization"] as const)(
    "never puts a password hash, session token, two-factor secret, passkey, API Key hash, or webhook secret in a %s export",
    async (kind) => {
      const archive = Object.values(await exportArchive(ids.alice, ids.acme, "owner", kind)).join(
        "\n"
      );

      for (const secret of [
        "scrypt-hash-of-alice",
        "alice-oauth-access-token",
        "alice-session-token",
        "alice-totp-secret",
        "alice-backup-codes",
        "acme-api-key-hash",
        "whsec_acme-signing-secret",
        "alice-passkey-public-key",
        "alice-passkey-credential-id"
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
    // The requester was demoted after the export was ready.
    await expect(exportsFor(ids.alice, ids.acme, "admin").downloadUrl(ready.id)).rejects.toThrow(
      "permission required: organization:export"
    );
    expect(
      audited.map(({ action, actorUserId, organizationId }) => ({
        action,
        actorUserId,
        organizationId
      }))
    ).toEqual([
      { action: "organization_exported", actorUserId: ids.alice, organizationId: ids.acme },
      { action: "organization_export_downloaded", actorUserId: ids.alice, organizationId: ids.acme }
    ]);
  });

  it("fails an export over the size cap with a reason and stores no archive", async () => {
    const requested = await exportsFor(ids.alice, ids.acme, "owner").request("user");
    const before = store.keys();

    await runJob(requested.id, { maxArchiveBytes: 64 });

    const [row] = await database.db
      .select()
      .from(dataExportsTable)
      .where(eq(dataExportsTable.id, requested.id));
    expect(row).toMatchObject({ status: "failed", failureReason: "too_large", key: null });
    expect(store.keys()).toEqual(before);
    expect(sentEmails).toEqual([]);
  });

  it("deletes a stored archive when the export cannot be marked ready", async () => {
    const requested = await exportsFor(ids.alice, ids.acme, "owner").request("user");
    const before = store.keys();
    // The archive is stored, then the ready update fails, as a lost
    // connection would make it.
    await database.client.exec(`
      create function refuse_ready() returns trigger language plpgsql as
        'begin raise exception ''ready refused''; end';
      create trigger refuse_ready before update on data_exports
        for each row when (new.status = 'ready') execute function refuse_ready();
    `);

    try {
      await runJob(requested.id);
    } finally {
      await database.client.exec(
        "drop trigger refuse_ready on data_exports; drop function refuse_ready();"
      );
    }

    const [row] = await database.db
      .select()
      .from(dataExportsTable)
      .where(eq(dataExportsTable.id, requested.id));
    expect(row).toMatchObject({ status: "failed", failureReason: "error", key: null });
    expect(store.keys()).toEqual(before);
  });

  describe("an export larger than one page of every list", () => {
    const paged = { carol: "", org: "" };
    // Three rows share a timestamp and two differ from it by a microsecond,
    // finer than a JS Date: the keyset cursor must neither skip nor repeat one.
    const createdAts = [
      "2026-01-01T00:00:00.000000Z",
      "2026-01-01T00:00:00.000000Z",
      "2026-01-01T00:00:00.000000Z",
      "2026-01-01T00:00:00.000001Z",
      "2026-01-01T00:00:00.000002Z"
    ].map((timestamp) => sql`${timestamp}::timestamptz`);
    const pageSize = 2;

    beforeAll(async () => {
      const db = database.db;
      const [carol, dave, erin] = await db
        .insert(usersTable)
        .values([
          { email: "carol@example.test", name: "Carol" },
          { email: "dave@example.test", name: "Dave" },
          { email: "erin@example.test", name: "Erin" }
        ])
        .returning();
      if (!carol || !dave || !erin) throw new Error("failed to seed users");
      const organizations = await db
        .insert(organizationsTable)
        .values([
          { name: "Paged One", slug: "paged-one", userId: carol.id },
          { name: "Paged Two", slug: "paged-two", userId: carol.id },
          { name: "Paged Three", slug: "paged-three", userId: carol.id }
        ])
        .returning();
      const org = organizations[0];
      if (!org) throw new Error("failed to seed organizations");
      Object.assign(paged, { carol: carol.id, org: org.id });
      await db.insert(membersTable).values([
        ...organizations.map(({ id }) => ({
          organizationId: id,
          userId: carol.id,
          role: "owner"
        })),
        { organizationId: org.id, userId: dave.id, role: "member" },
        { organizationId: org.id, userId: erin.id, role: "member" }
      ]);

      const [conversation] = await db
        .insert(assistantConversationsTable)
        .values(
          createdAts.map((createdAt, index) => ({
            userId: carol.id,
            organizationId: org.id,
            title: `conversation-p${index + 1}`,
            createdAt
          }))
        )
        .returning();
      if (!conversation) throw new Error("failed to seed conversations");
      const rows = createdAts.map((createdAt, index) => ({ createdAt, label: `p${index + 1}` }));
      const author = { userId: carol.id, organizationId: org.id };
      // A newline and non-ASCII text in a value: the streamed JSON escapes them as JSON.stringify does.
      const text = "first line\nsecond line — ✓ é";
      await db.insert(todosTable).values(
        rows.map(({ createdAt, label }) => ({
          ...author,
          title: `todo-${label}`,
          description: text,
          createdAt
        }))
      );
      await db.insert(notesTable).values(
        rows.map(({ createdAt, label }) => ({
          ...author,
          title: `note-${label}`,
          body: text,
          createdAt
        }))
      );
      await db.insert(assistantMessagesTable).values(
        rows.map(({ createdAt, label }) => ({
          conversationId: conversation.id,
          organizationId: org.id,
          role: "user",
          content: `message-${label}`,
          createdAt
        }))
      );
      await db.insert(filesTable).values(
        rows.map(({ createdAt, label }) => ({
          key: `${org.id}/file-${label}`,
          bucket: "memory",
          originalName: `file-${label}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1,
          status: "uploaded" as const,
          uploadedBy: carol.id,
          organizationId: org.id,
          createdAt
        }))
      );
      await db.insert(invitationsTable).values(
        rows.map(({ createdAt, label }) => ({
          organizationId: org.id,
          email: `invitee-${label}@example.test`,
          role: "member",
          inviterId: carol.id,
          expiresAt: new Date(now.getTime() + day),
          createdAt
        }))
      );
    }, 30_000);

    const listSchema = z.array(z.record(z.string(), z.unknown()));

    /** Each row of a list file once, in any order: no row skipped or repeated. */
    function expectRows(
      files: Record<string, string>,
      name: string,
      field: string,
      expected: string[]
    ) {
      const values = listSchema.parse(JSON.parse(files[name] ?? "")).map((row) => row[field]);
      expect(values).toHaveLength(expected.length);
      expect(values).toEqual(expect.arrayContaining(expected));
    }

    /** Every file is written exactly as JSON.stringify(value, null, 2) and a newline write it. */
    function expectPrettyJson(files: Record<string, string>) {
      for (const [name, text] of Object.entries(files)) {
        const parsed: unknown = JSON.parse(text);
        expect({ name, text }).toEqual({ name, text: `${JSON.stringify(parsed, null, 2)}\n` });
      }
    }

    it("holds every row of a user export, read in pages", async () => {
      const files = await exportArchive(paged.carol, paged.org, "owner", "user", { pageSize });

      expectRows(files, "memberships.json", "organizationName", [
        "Paged One",
        "Paged Two",
        "Paged Three"
      ]);
      expectRows(files, "todos.json", "title", [
        "todo-p1",
        "todo-p2",
        "todo-p3",
        "todo-p4",
        "todo-p5"
      ]);
      expectRows(files, "notes.json", "title", [
        "note-p1",
        "note-p2",
        "note-p3",
        "note-p4",
        "note-p5"
      ]);
      expectRows(files, "files-manifest.json", "name", [
        "file-p1.pdf",
        "file-p2.pdf",
        "file-p3.pdf",
        "file-p4.pdf",
        "file-p5.pdf"
      ]);
      expectRows(files, "assistant-conversations.json", "title", [
        "conversation-p1",
        "conversation-p2",
        "conversation-p3",
        "conversation-p4",
        "conversation-p5"
      ]);
      expectRows(files, "assistant-messages.json", "content", [
        "message-p1",
        "message-p2",
        "message-p3",
        "message-p4",
        "message-p5"
      ]);
      expectPrettyJson(files);
    });

    it("holds every row of an Organization export, and reads each list a page at a time", async () => {
      const queries: string[] = [];
      const db = drizzle(database.client, {
        logger: { logQuery: (query) => void queries.push(query) }
      });

      const files = await exportArchive(paged.carol, paged.org, "owner", "organization", {
        db,
        pageSize
      });

      expectRows(files, "members.json", "email", [
        "carol@example.test",
        "dave@example.test",
        "erin@example.test"
      ]);
      expectRows(files, "invitations.json", "email", [
        "invitee-p1@example.test",
        "invitee-p2@example.test",
        "invitee-p3@example.test",
        "invitee-p4@example.test",
        "invitee-p5@example.test"
      ]);
      expectRows(files, "todos.json", "title", [
        "todo-p1",
        "todo-p2",
        "todo-p3",
        "todo-p4",
        "todo-p5"
      ]);
      expectRows(files, "notes.json", "title", [
        "note-p1",
        "note-p2",
        "note-p3",
        "note-p4",
        "note-p5"
      ]);
      expectRows(files, "files-manifest.json", "name", [
        "file-p1.pdf",
        "file-p2.pdf",
        "file-p3.pdf",
        "file-p4.pdf",
        "file-p5.pdf"
      ]);
      expectPrettyJson(files);
      // Five rows in pages of two: three queries, none of them for every row.
      expect(queries.filter((query) => query.includes('from "notes"'))).toHaveLength(3);
      expect(queries.filter((query) => query.includes('from "invitations"'))).toHaveLength(3);
    });
  });
});
