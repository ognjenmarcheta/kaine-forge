import {
  invitationsTable,
  organizationsTable,
  sessionsTable,
  usersTable,
  verificationsTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveHousekeepingConfig } from "./housekeeping.config";
import { purgeExpiredAuthRows } from "./housekeeping.sweep";

let database: TestDatabase;
let userId: string;
let orgId: string;

const now = new Date("2026-06-01T00:00:00Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

beforeAll(async () => {
  database = await createTestDatabase();
  const [user] = await database.db
    .insert(usersTable)
    .values({ email: "housekeeping@example.test", name: "Housekeeping" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [org] = await database.db
    .insert(organizationsTable)
    .values({ name: "Housekeeping", slug: "housekeeping", userId: user.id })
    .returning();
  if (!org) throw new Error("failed to seed organization");
  userId = user.id;
  orgId = org.id;
}, 30_000);

beforeEach(async () => {
  await database.db.delete(sessionsTable);
  await database.db.delete(verificationsTable);
  await database.db.delete(invitationsTable);
});

afterAll(async () => {
  await database.close();
});

async function seedSession(token: string, expiresAt: Date) {
  await database.db.insert(sessionsTable).values({ userId, token, expiresAt });
}

async function seedVerification(identifier: string, expiresAt: Date) {
  await database.db.insert(verificationsTable).values({ identifier, value: "v", expiresAt });
}

async function seedInvitation(email: string, status: string, expiresAt: Date) {
  await database.db
    .insert(invitationsTable)
    .values({ organizationId: orgId, email, role: "member", status, expiresAt, inviterId: userId });
}

async function remaining() {
  const sessions = await database.db.select({ token: sessionsTable.token }).from(sessionsTable);
  const verifications = await database.db
    .select({ identifier: verificationsTable.identifier })
    .from(verificationsTable);
  const invitations = await database.db
    .select({ email: invitationsTable.email })
    .from(invitationsTable);
  return {
    sessions: sessions.map((row) => row.token).sort(),
    verifications: verifications.map((row) => row.identifier).sort(),
    invitations: invitations.map((row) => row.email).sort()
  };
}

describe("purgeExpiredAuthRows", () => {
  it("deletes expired rows in batches and keeps live rows and recent Invitations", async () => {
    await seedSession("expired-1", at(-1));
    await seedSession("expired-2", at(-day));
    await seedSession("expired-3", at(-7 * day));
    await seedSession("live", at(day));
    await seedVerification("expired", at(-1));
    await seedVerification("live", at(60_000));
    await seedInvitation("old-pending@example.test", "pending", at(-31 * day));
    await seedInvitation("old-accepted@example.test", "accepted", at(-31 * day));
    await seedInvitation("recent-expired@example.test", "pending", at(-day));
    await seedInvitation("live-pending@example.test", "pending", at(7 * day));

    await expect(purgeExpiredAuthRows({ db: database.db, now, batchSize: 2 })).resolves.toEqual({
      sessions: 3,
      verifications: 1,
      invitations: 2
    });

    expect(await remaining()).toEqual({
      sessions: ["live"],
      verifications: ["live"],
      invitations: ["live-pending@example.test", "recent-expired@example.test"]
    });
  });

  it("deletes nothing while another replica holds the housekeeping lock", async () => {
    await seedSession("expired", at(-1));
    await seedVerification("expired", at(-1));
    await seedInvitation("old@example.test", "pending", at(-31 * day));
    // PGlite has one session, and a session never conflicts with its own
    // advisory locks. A shadowing function answers the lock attempt the way
    // Postgres does while another connection holds the key.
    await database.client.exec(`
      create schema held_locks;
      create function held_locks.pg_try_advisory_xact_lock(bigint) returns boolean
        language sql as 'select false';
      set search_path = held_locks, pg_catalog, public;
    `);

    try {
      await expect(purgeExpiredAuthRows({ db: database.db, now })).resolves.toEqual({
        sessions: 0,
        verifications: 0,
        invitations: 0
      });
    } finally {
      await database.client.exec("reset search_path; drop schema held_locks cascade;");
    }

    expect(await remaining()).toEqual({
      sessions: ["expired"],
      verifications: ["expired"],
      invitations: ["old@example.test"]
    });
  });
});

describe("resolveHousekeepingConfig", () => {
  const defaultRetention = {
    auditEventsMs: 365 * day,
    dataExportsMs: 30 * day,
    notificationsMs: 90 * day,
    purgedFilesMs: 30 * day,
    webhookDeliveriesMs: 30 * day
  };

  it("runs hourly by default, turns off on false, and takes a custom interval", () => {
    expect(resolveHousekeepingConfig({})).toEqual({
      intervalMs: 60 * 60 * 1000,
      retention: defaultRetention
    });
    expect(resolveHousekeepingConfig({ HOUSEKEEPING_ENABLED: "true" })).toMatchObject({
      intervalMs: 60 * 60 * 1000
    });
    expect(resolveHousekeepingConfig({ HOUSEKEEPING_ENABLED: "false" })).toBeNull();
    expect(resolveHousekeepingConfig({ HOUSEKEEPING_INTERVAL_MS: "60000" })).toMatchObject({
      intervalMs: 60_000
    });
  });

  it("takes each retention window in days and falls back on a missing or invalid one", () => {
    expect(
      resolveHousekeepingConfig({
        RETENTION_AUDIT_EVENTS_DAYS: "730",
        RETENTION_DATA_EXPORTS_DAYS: "7",
        RETENTION_NOTIFICATIONS_DAYS: "0",
        RETENTION_PURGED_FILES_DAYS: "soon",
        RETENTION_WEBHOOK_DELIVERIES_DAYS: "14"
      })?.retention
    ).toEqual({
      auditEventsMs: 730 * day,
      dataExportsMs: 7 * day,
      notificationsMs: 90 * day,
      purgedFilesMs: 30 * day,
      webhookDeliveriesMs: 14 * day
    });
  });
});
