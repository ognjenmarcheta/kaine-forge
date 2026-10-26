import { filesTable, organizationsTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryObjectStore } from "./attachment.store.memory";
import { sweepAttachmentObjects, sweepStaleObjects, withSweepLock } from "./attachment.sweep";
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
