import {
  filesTable,
  organizationStoragePurgesTable,
  organizationsTable,
  publicAssetPurgesTable,
  usersTable
} from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryObjectStore } from "./attachment.store.memory";
import {
  sweepAttachmentObjects,
  sweepDeletedOrganizations,
  sweepDeletedPublicAssets,
  sweepStaleObjects,
  withSweepLock
} from "./attachment.sweep";
import { resolveAttachmentSweepConfig } from "./storage.config";

let database: TestDatabase;
let userId: string;
let orgId: string;
let otherOrgId: string;

const logger = createLogger({ level: "silent", name: "attachment-sweep-test" });
const cutoff = new Date("2026-01-02T00:00:00Z");
const before = new Date("2026-01-01T00:00:00Z");
const after = new Date("2026-01-03T00:00:00Z");

beforeAll(async () => {
  database = await createTestDatabase();
  const [user] = await database.db
    .insert(usersTable)
    .values({ email: "sweep@example.test", name: "Sweep" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [own, other] = await database.db
    .insert(organizationsTable)
    .values([
      { name: "Own", slug: "sweep-own", userId: user.id },
      { name: "Other", slug: "sweep-other", userId: user.id }
    ])
    .returning();
  if (!own || !other) throw new Error("failed to seed organizations");
  userId = user.id;
  orgId = own.id;
  otherOrgId = other.id;
}, 30_000);

afterAll(async () => {
  await database.close();
});

async function seed(
  name: string,
  status: "pending" | "uploaded" | "deleted",
  createdAt: Date,
  key = `${orgId}/todo/${name}/${name}.png`
) {
  const [row] = await database.db
    .insert(filesTable)
    .values({
      key,
      bucket: "uploads",
      originalName: `${name}.png`,
      mimeType: "image/png",
      sizeBytes: 8,
      status,
      uploadedBy: userId,
      organizationId: orgId,
      createdAt,
      updatedAt: createdAt
    })
    .returning();
  if (!row) throw new Error("failed to seed file");
  return row;
}

async function purgedAt(id: string) {
  const [row] = await database.db.select().from(filesTable).where(eq(filesTable.id, id));
  return row?.purgedAt ?? null;
}

describe("sweepAttachmentObjects", () => {
  it("deletes objects of deleted and abandoned rows only, and retries a failed delete next run", async () => {
    const memory = createMemoryObjectStore("uploads");
    const deleted = await seed("deleted", "deleted", after);
    const abandoned = await seed("abandoned", "pending", before);
    const inFlight = await seed("in-flight", "pending", after);
    const live = await seed("live", "uploaded", before);
    const failing = await seed("failing", "deleted", after);
    const foreignKey = await seed(
      "foreign-key",
      "deleted",
      after,
      `${otherOrgId}/todo/x/foreign-key.png`
    );
    for (const row of [deleted, abandoned, inFlight, live, failing, foreignKey]) {
      memory.upload(row, { contentType: "image/png", sizeBytes: 8 });
    }
    memory.upload(
      { bucket: "uploads", key: `${deleted.key}.thumb.webp` },
      { contentType: "image/webp", sizeBytes: 4 }
    );
    const store = {
      delete: async (ref: { bucket: string; key: string }) => {
        if (ref.key === failing.key) throw new Error("s3 unreachable");
        await memory.delete(ref);
      }
    };

    const first = await sweepAttachmentObjects({
      db: database.db,
      logger,
      store,
      pendingCutoff: cutoff,
      batchSize: 2
    });

    expect(first).toEqual({ purged: 2, failed: 2 });
    expect(memory.keys()).toEqual([inFlight.key, live.key, failing.key, foreignKey.key].sort());
    expect(await purgedAt(deleted.id)).not.toBeNull();
    expect(await purgedAt(abandoned.id)).not.toBeNull();
    expect(await purgedAt(failing.id)).toBeNull();
    expect(await purgedAt(foreignKey.id)).toBeNull();
    const [abandonedRow] = await database.db
      .select()
      .from(filesTable)
      .where(eq(filesTable.id, abandoned.id));
    expect(abandonedRow?.status).toBe("deleted");

    const second = await sweepAttachmentObjects({
      db: database.db,
      logger,
      store: memory,
      pendingCutoff: cutoff
    });

    expect(second).toEqual({ purged: 1, failed: 1 });
    expect(memory.keys()).toEqual([inFlight.key, live.key, foreignKey.key].sort());
    expect(await purgedAt(failing.id)).not.toBeNull();
    expect(await purgedAt(foreignKey.id)).toBeNull();
  });

  it("runs under the sweep lock", async () => {
    let ran = false;

    await expect(
      withSweepLock(database.db, async () => {
        ran = true;
      })
    ).resolves.toBe(true);
    expect(ran).toBe(true);
  });
});

describe("sweepStaleObjects", () => {
  it("deletes only objects under the prefix written before the cutoff", async () => {
    const memory = createMemoryObjectStore("uploads");
    memory.upload(
      { bucket: "uploads", key: "staging/avatar/u/old" },
      {
        contentType: "image/png",
        sizeBytes: 8,
        lastModified: before
      }
    );
    memory.upload(
      { bucket: "uploads", key: "staging/avatar/u/new" },
      {
        contentType: "image/png",
        sizeBytes: 8,
        lastModified: after
      }
    );
    memory.upload(
      { bucket: "uploads", key: `${orgId}/todo/f/old.png` },
      {
        contentType: "image/png",
        sizeBytes: 8,
        lastModified: before
      }
    );

    await expect(
      sweepStaleObjects({ logger, store: memory, prefix: "staging/", before: cutoff })
    ).resolves.toBe(1);

    expect(memory.keys()).toEqual([`${orgId}/todo/f/old.png`, "staging/avatar/u/new"].sort());
  });
});

describe("sweepDeletedOrganizations", () => {
  const publicStorage = { bucket: "public", baseUrl: "https://cdn.example.test" };

  async function queuedPurges() {
    return database.db
      .select({ organizationId: organizationStoragePurgesTable.organizationId })
      .from(organizationStoragePurgesTable);
  }

  it("deletes a deleted organization's objects and logo, and keeps others", async () => {
    const doomedId = randomUUID();
    const [doomed] = await database.db
      .insert(organizationsTable)
      .values({
        id: doomedId,
        name: "Doomed",
        slug: "sweep-doomed",
        userId,
        logo: `https://cdn.example.test/organization-logos/${doomedId}/doomed.webp`
      })
      .returning();
    if (!doomed) throw new Error("failed to seed organization");
    const memory = createMemoryObjectStore("uploads");
    const object = { contentType: "image/png", sizeBytes: 8, lastModified: before };
    memory.upload({ bucket: "uploads", key: `${doomed.id}/todo/a/a.png` }, object);
    memory.upload({ bucket: "uploads", key: `${doomed.id}/todo/b/b.png` }, object);
    memory.upload({ bucket: "uploads", key: `${otherOrgId}/todo/c/c.png` }, object);
    memory.upload({ bucket: "public", key: `organization-logos/${doomedId}/doomed.webp` }, object);

    // The delete trigger queues the purge; the files rows cascade away.
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, doomed.id));
    // Deleted after the cutoff: upload URLs issued before it may still be live.
    await database.db
      .update(organizationStoragePurgesTable)
      .set({ createdAt: after })
      .where(eq(organizationStoragePurgesTable.organizationId, doomed.id));

    await expect(
      sweepDeletedOrganizations({
        db: database.db,
        logger,
        store: memory,
        publicStorage,
        pendingCutoff: cutoff,
        batchSize: 1
      })
    ).resolves.toEqual({ deletedObjects: 2, failed: 0 });
    expect(memory.keys()).toEqual([`${otherOrgId}/todo/c/c.png`]);
    expect(await queuedPurges()).toEqual([{ organizationId: doomed.id }]);

    // Once the cutoff passes the deletion, an empty prefix ends the purge.
    await sweepDeletedOrganizations({
      db: database.db,
      logger,
      store: memory,
      publicStorage,
      pendingCutoff: new Date(after.getTime() + 1)
    });
    expect(await queuedPurges()).toEqual([]);
  });

  it("keeps the purge queued while the logo delete fails, and still clears the objects", async () => {
    const withLogoId = randomUUID();
    const [withLogo] = await database.db
      .insert(organizationsTable)
      .values({
        id: withLogoId,
        name: "Logo",
        slug: "sweep-logo",
        userId,
        logo: `https://cdn.example.test/organization-logos/${withLogoId}/stuck.webp`
      })
      .returning();
    if (!withLogo) throw new Error("failed to seed organization");
    const memory = createMemoryObjectStore("uploads");
    memory.upload(
      { bucket: "uploads", key: `${withLogo.id}/todo/a/a.png` },
      { contentType: "image/png", sizeBytes: 8, lastModified: before }
    );
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, withLogo.id));

    await expect(
      sweepDeletedOrganizations({
        db: database.db,
        logger,
        store: {
          ...memory,
          delete: async (ref: { bucket: string; key: string }) => {
            if (ref.bucket === publicStorage.bucket) throw new Error("cdn bucket unreachable");
            await memory.delete(ref);
          }
        },
        publicStorage,
        // The cutoff has passed the deletion: only the failed logo keeps the row.
        pendingCutoff: new Date(Date.now() + 60_000)
      })
    ).resolves.toEqual({ deletedObjects: 1, failed: 1 });
    expect(memory.keys()).toEqual([]);
    expect(await queuedPurges()).toEqual([{ organizationId: withLogo.id }]);
    await database.db
      .delete(organizationStoragePurgesTable)
      .where(eq(organizationStoragePurgesTable.organizationId, withLogo.id));
  });

  it("does not let a row that keeps failing block a later organization's purge", async () => {
    const stuckId = randomUUID();
    const [stuck, later] = await database.db
      .insert(organizationsTable)
      .values([
        {
          id: stuckId,
          name: "Stuck",
          slug: "sweep-stuck",
          userId,
          logo: `https://cdn.example.test/organization-logos/${stuckId}/stuck-forever.webp`
        },
        { name: "Later", slug: "sweep-later", userId }
      ])
      .returning();
    if (!stuck || !later) throw new Error("failed to seed organizations");
    const memory = createMemoryObjectStore("uploads");
    memory.upload(
      { bucket: "uploads", key: `${later.id}/todo/a/a.png` },
      { contentType: "image/png", sizeBytes: 8, lastModified: before }
    );
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, stuck.id));
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, later.id));
    // The stuck row is the oldest, so a batch of one always selects it first.
    await database.db
      .update(organizationStoragePurgesTable)
      .set({ createdAt: before })
      .where(eq(organizationStoragePurgesTable.organizationId, stuck.id));
    const sweep = () =>
      sweepDeletedOrganizations({
        db: database.db,
        logger,
        store: {
          ...memory,
          delete: async (ref: { bucket: string; key: string }) => {
            if (ref.bucket === publicStorage.bucket) throw new Error("cdn bucket denied");
            await memory.delete(ref);
          }
        },
        publicStorage,
        pendingCutoff: new Date(Date.now() + 60_000),
        batchSize: 1
      });

    await sweep();
    await sweep();

    expect(memory.keys()).toEqual([]);
    expect(await queuedPurges()).toEqual([{ organizationId: stuck.id }]);
    await database.db
      .delete(organizationStoragePurgesTable)
      .where(eq(organizationStoragePurgesTable.organizationId, stuck.id));
  });

  it("never deletes a logo that belongs to another organization", async () => {
    const [borrower] = await database.db
      .insert(organizationsTable)
      .values({
        name: "Borrower",
        slug: "sweep-borrower",
        userId,
        logo: `https://cdn.example.test/organization-logos/${otherOrgId}/logo.webp`
      })
      .returning();
    if (!borrower) throw new Error("failed to seed organization");
    const memory = createMemoryObjectStore("uploads");
    memory.upload(
      { bucket: "public", key: `organization-logos/${otherOrgId}/logo.webp` },
      { contentType: "image/webp", sizeBytes: 8, lastModified: before }
    );
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, borrower.id));

    await sweepDeletedOrganizations({
      db: database.db,
      logger,
      store: memory,
      publicStorage,
      pendingCutoff: new Date(Date.now() + 60_000)
    });

    expect(memory.keys()).toEqual([`organization-logos/${otherOrgId}/logo.webp`]);
    expect(await queuedPurges()).toEqual([]);
  });

  it("keeps the purge queued while an object delete fails", async () => {
    const [failing] = await database.db
      .insert(organizationsTable)
      .values({ name: "Failing", slug: "sweep-failing", userId })
      .returning();
    if (!failing) throw new Error("failed to seed organization");
    const memory = createMemoryObjectStore("uploads");
    memory.upload(
      { bucket: "uploads", key: `${failing.id}/todo/a/a.png` },
      { contentType: "image/png", sizeBytes: 8, lastModified: before }
    );
    await database.db.delete(organizationsTable).where(eq(organizationsTable.id, failing.id));

    await expect(
      sweepDeletedOrganizations({
        db: database.db,
        logger,
        store: {
          ...memory,
          delete: async () => {
            throw new Error("s3 unreachable");
          }
        },
        publicStorage: null,
        pendingCutoff: new Date(Date.now() + 60_000)
      })
    ).resolves.toEqual({ deletedObjects: 0, failed: 1 });
    expect(await queuedPurges()).toEqual([{ organizationId: failing.id }]);
  });
});

describe("sweepDeletedPublicAssets", () => {
  const publicStorage = { bucket: "public", baseUrl: "https://cdn.example.test" };
  const object = { contentType: "image/webp", sizeBytes: 8, lastModified: before };

  // The users delete trigger queues the avatar URL with the user id.
  async function deleteUserWithAvatar(label: string, image: (id: string) => string) {
    const id = randomUUID();
    await database.db
      .insert(usersTable)
      .values({ id, email: `${label}@example.test`, name: label, image: image(id) });
    await database.db.delete(usersTable).where(eq(usersTable.id, id));
    return id;
  }

  async function queuedUrls() {
    return database.db.select({ url: publicAssetPurgesTable.url }).from(publicAssetPurgesTable);
  }

  it("deletes a deleted user's own avatar only, and drops every other url", async () => {
    const victimId = randomUUID();
    const memory = createMemoryObjectStore("uploads");
    memory.upload({ bucket: "public", key: `avatars/${victimId}/kept.webp` }, object);
    const goneId = await deleteUserWithAvatar(
      "avatar-gone",
      (id) => `https://cdn.example.test/avatars/${id}/gone.webp`
    );
    memory.upload({ bucket: "public", key: `avatars/${goneId}/gone.webp` }, object);
    await deleteUserWithAvatar("avatar-social", () => "https://avatars.github.test/u/1");
    // Another user's avatar URL, as an attacker could have stored it.
    await deleteUserWithAvatar(
      "avatar-borrowed",
      () => `https://cdn.example.test/avatars/${victimId}/kept.webp`
    );

    await expect(
      sweepDeletedPublicAssets({ db: database.db, logger, store: memory, publicStorage })
    ).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(memory.keys()).toEqual([`avatars/${victimId}/kept.webp`]);
    expect(await queuedUrls()).toEqual([]);
  });

  it("keeps a failed avatar delete queued for the next run", async () => {
    const stuckId = await deleteUserWithAvatar(
      "avatar-stuck",
      (id) => `https://cdn.example.test/avatars/${id}/stuck.webp`
    );
    const failing = {
      delete: async () => {
        throw new Error("cdn bucket unreachable");
      }
    };

    await expect(
      sweepDeletedPublicAssets({ db: database.db, logger, store: failing, publicStorage })
    ).resolves.toEqual({ deleted: 0, failed: 1 });
    expect(await queuedUrls()).toEqual([
      { url: `https://cdn.example.test/avatars/${stuckId}/stuck.webp` }
    ]);

    const memory = createMemoryObjectStore("uploads");
    await expect(
      sweepDeletedPublicAssets({ db: database.db, logger, store: memory, publicStorage })
    ).resolves.toEqual({ deleted: 1, failed: 0 });
    expect(await queuedUrls()).toEqual([]);
  });
});

describe("resolveAttachmentSweepConfig", () => {
  const s3 = {
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "key",
    S3_SECRET_KEY: "secret",
    S3_BUCKET: "files"
  };

  it("sweeps by default only when S3 is configured, and fails loudly when forced without it", () => {
    expect(resolveAttachmentSweepConfig({})).toBeNull();
    expect(resolveAttachmentSweepConfig({ ...s3, STORAGE_SWEEP_ENABLED: "false" })).toBeNull();
    expect(() => resolveAttachmentSweepConfig({ STORAGE_SWEEP_ENABLED: "true" })).toThrow(
      "S3_ENDPOINT"
    );
    expect(resolveAttachmentSweepConfig({ ...s3, S3_UPLOAD_URL_EXPIRY: "600" })).toEqual({
      intervalMs: 15 * 60 * 1000,
      pendingTtlMs: 600_000 + 24 * 60 * 60 * 1000
    });
  });
});
