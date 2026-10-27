import {
  auditEventsTable,
  dataExportsTable,
  filesTable,
  notificationsTable,
  organizationsTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyRetention, type RetentionWindows } from "./housekeeping.retention";
import { createMemoryObjectStore } from "../storage/attachment.store.memory";

let database: TestDatabase;
let userId: string;
let orgId: string;

const now = new Date("2026-06-01T00:00:00Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const warnings: string[] = [];
const logger = {
  warn: (_fields: { exportId: string }, message: string) => void warnings.push(message)
};
const windows: RetentionWindows = {
  auditEventsMs: 365 * day,
  dataExportsMs: 30 * day,
  notificationsMs: 90 * day,
  purgedFilesMs: 30 * day
};

beforeAll(async () => {
  database = await createTestDatabase();
  const [user] = await database.db
    .insert(usersTable)
    .values({ email: "retention@example.test", name: "Retention" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [org] = await database.db
    .insert(organizationsTable)
    .values({ name: "Retention", slug: "retention", userId: user.id })
    .returning();
  if (!org) throw new Error("failed to seed organization");
  userId = user.id;
  orgId = org.id;
}, 30_000);

beforeEach(async () => {
  await database.db.delete(filesTable);
  await database.db.delete(auditEventsTable);
  await database.db.delete(notificationsTable);
  await database.db.delete(dataExportsTable);
  warnings.length = 0;
});

afterAll(async () => {
  await database.close();
});

async function seedFile(name: string, status: "deleted" | "uploaded", purgedAt: Date | null) {
  await database.db.insert(filesTable).values({
    key: `${orgId}/${name}`,
    bucket: "memory",
    originalName: name,
    mimeType: "text/plain",
    sizeBytes: 1,
    status,
    organizationId: orgId,
    purgedAt
  });
}

async function seedAuditEvent(targetType: string, createdAt: Date) {
  await database.db.insert(auditEventsTable).values({
    organizationId: orgId,
    action: "organization_renamed",
    targetType,
    targetId: orgId,
    createdAt
  });
}

async function seedNotification(type: string, createdAt: Date) {
  await database.db.insert(notificationsTable).values({ userId, type, createdAt });
}

async function seedExport(
  name: string,
  values: Partial<typeof dataExportsTable.$inferInsert> &
    Pick<typeof dataExportsTable.$inferInsert, "status">
) {
  await database.db.insert(dataExportsTable).values({
    kind: "user",
    userId,
    // The archive key names the row, so the assertions can tell rows apart.
    key: `exports/users/${name}.zip`,
    bucket: "memory",
    ...values
  });
}

async function remaining() {
  const files = await database.db
    .select({ name: filesTable.originalName })
    .from(filesTable)
    .orderBy(asc(filesTable.originalName));
  const auditEvents = await database.db
    .select({ targetType: auditEventsTable.targetType })
    .from(auditEventsTable)
    .orderBy(asc(auditEventsTable.targetType));
  const notifications = await database.db
    .select({ type: notificationsTable.type })
    .from(notificationsTable)
    .orderBy(asc(notificationsTable.type));
  const exports = await database.db
    .select({ key: dataExportsTable.key, status: dataExportsTable.status })
    .from(dataExportsTable)
    .orderBy(asc(dataExportsTable.createdAt));
  return {
    files: files.map((row) => row.name),
    auditEvents: auditEvents.map((row) => row.targetType),
    notifications: notifications.map((row) => row.type),
    exports
  };
}

describe("applyRetention", () => {
  it("deletes only rows older than their window, and expires archives past their expiry", async () => {
    const store = createMemoryObjectStore();
    await seedFile("old-purged", "deleted", at(-31 * day));
    await seedFile("recent-purged", "deleted", at(-day));
    // Deleted but its object may still exist: the storage sweep owns it.
    await seedFile("deleted-not-purged", "deleted", null);
    await seedFile("old-uploaded", "uploaded", null);
    await seedAuditEvent("old", at(-366 * day));
    await seedAuditEvent("recent", at(-364 * day));
    await seedNotification("old", at(-91 * day));
    await seedNotification("recent", at(-89 * day));
    for (const name of ["expired-archive", "live-archive", "orphan-archive"]) {
      await store.put(
        { bucket: "memory", key: `exports/users/${name}.zip` },
        new Uint8Array(1),
        "application/zip"
      );
    }
    await seedExport("expired-archive", {
      status: "ready",
      expiresAt: at(-1),
      createdAt: at(-8 * day)
    });
    await seedExport("live-archive", {
      status: "ready",
      expiresAt: at(day),
      createdAt: at(-6 * day)
    });
    // The requester deleted their account: their own archive goes at once.
    await seedExport("orphan-archive", {
      status: "ready",
      userId: null,
      expiresAt: at(day),
      createdAt: at(-5 * day)
    });
    // A job lost in a crash would block every later request of this kind.
    await seedExport("stuck", {
      status: "running",
      kind: "organization",
      organizationId: orgId,
      updatedAt: at(-2 * day),
      createdAt: at(-4 * day)
    });
    await seedExport("in-progress", {
      status: "pending",
      updatedAt: at(-60_000),
      createdAt: at(-3 * day)
    });
    await seedExport("old-failed", {
      status: "failed",
      updatedAt: at(-31 * day),
      createdAt: at(-32 * day)
    });
    await seedExport("old-expired", {
      status: "expired",
      updatedAt: at(-31 * day),
      createdAt: at(-31 * day)
    });

    await expect(
      applyRetention({ db: database.db, store, now, windows, batchSize: 1, logger })
    ).resolves.toEqual({
      purgedFiles: 1,
      auditEvents: 1,
      notifications: 1,
      stalledExports: 1,
      exportArchives: 2,
      dataExports: 2
    });

    expect(await remaining()).toEqual({
      files: ["deleted-not-purged", "old-uploaded", "recent-purged"],
      auditEvents: ["recent"],
      notifications: ["recent"],
      exports: [
        { key: null, status: "expired" },
        { key: "exports/users/live-archive.zip", status: "ready" },
        { key: null, status: "expired" },
        { key: "exports/users/stuck.zip", status: "failed" },
        { key: "exports/users/in-progress.zip", status: "pending" }
      ]
    });
    expect(store.keys()).toEqual(["exports/users/live-archive.zip"]);
  });

  it("deletes nothing while another replica holds the housekeeping lock", async () => {
    const store = createMemoryObjectStore();
    await store.put(
      { bucket: "memory", key: "exports/users/expired.zip" },
      new Uint8Array(1),
      "application/zip"
    );
    await seedFile("old-purged", "deleted", at(-31 * day));
    await seedAuditEvent("old", at(-366 * day));
    await seedExport("expired", { status: "ready", expiresAt: at(-1) });
    // PGlite has one session, which never conflicts with its own advisory
    // locks; this function answers the lock attempt as Postgres does while
    // another connection holds the key.
    await database.client.exec(`
      create schema held_locks;
      create function held_locks.pg_try_advisory_xact_lock(bigint) returns boolean
        language sql as 'select false';
      set search_path = held_locks, pg_catalog, public;
    `);

    try {
      await expect(
        applyRetention({ db: database.db, store, now, windows, logger })
      ).resolves.toEqual({
        purgedFiles: 0,
        auditEvents: 0,
        notifications: 0,
        stalledExports: 0,
        exportArchives: 0,
        dataExports: 0
      });
    } finally {
      await database.client.exec("reset search_path; drop schema held_locks cascade;");
    }

    expect(await remaining()).toMatchObject({
      files: ["old-purged"],
      auditEvents: ["old"],
      exports: [{ key: "exports/users/expired.zip", status: "ready" }]
    });
    expect(store.keys()).toEqual(["exports/users/expired.zip"]);
  });

  it("skips an archive whose delete keeps failing and still expires and purges the rest", async () => {
    const memory = createMemoryObjectStore();
    const store = {
      ...memory,
      delete: async (ref: { bucket: string; key: string }) => {
        if (ref.key.endsWith("stuck-archive.zip")) throw new Error("storage unavailable");
        await memory.delete(ref);
      }
    };
    for (const name of ["stuck-archive", "other-archive"]) {
      await memory.put(
        { bucket: "memory", key: `exports/users/${name}.zip` },
        new Uint8Array(1),
        "application/zip"
      );
    }
    await seedExport("stuck-archive", {
      status: "ready",
      expiresAt: at(-2),
      createdAt: at(-9 * day)
    });
    await seedExport("other-archive", {
      status: "ready",
      expiresAt: at(-1),
      createdAt: at(-8 * day)
    });
    await seedExport("old-failed", {
      status: "failed",
      updatedAt: at(-31 * day),
      createdAt: at(-32 * day)
    });

    await expect(
      applyRetention({ db: database.db, store, now, windows, batchSize: 1, logger })
    ).resolves.toMatchObject({ exportArchives: 1, dataExports: 1 });

    expect((await remaining()).exports).toEqual([
      { key: "exports/users/stuck-archive.zip", status: "ready" },
      { key: null, status: "expired" }
    ]);
    expect(memory.keys()).toEqual(["exports/users/stuck-archive.zip"]);
    expect(warnings).toEqual(["expired data export archive not deleted"]);
  });
});
