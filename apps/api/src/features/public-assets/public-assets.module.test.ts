import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { organizationsTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPublicAssets, type PublicAssets } from "./public-assets.module";
import { createMemoryObjectStore } from "../storage/attachment.store.memory";

const BASE_URL = "https://cdn.example.test";
const logger = createLogger({ level: "silent", name: "public-assets-test" });

let database: TestDatabase;
let owner: AuthenticatedOrganizationScope;
let member: AuthenticatedOrganizationScope;
let memory: ReturnType<typeof createMemoryObjectStore>;
let jpeg: Uint8Array;

function scopeFor(
  user: { id: string; email: string; name: string },
  organizationId: string,
  role: string
): AuthenticatedOrganizationScope {
  return {
    membership: { id: `membership-${user.id}`, role, userId: user.id },
    organizationId,
    user: {
      email: user.email,
      emailVerified: true,
      id: user.id,
      name: user.name,
      twoFactorEnabled: false
    },
    userId: user.id
  };
}

function assetsFor(
  scope: AuthenticatedOrganizationScope,
  publicStorage: { bucket: string; baseUrl: string } | null = {
    bucket: "public",
    baseUrl: BASE_URL
  }
): PublicAssets {
  return createPublicAssets({
    db: database.db,
    logger,
    publicStorage,
    requireOrganizationScope: () => scope,
    store: memory
  });
}

/** request + the client's PUT of `bytes` to the staging key. */
async function staged(
  assets: PublicAssets,
  kind: "avatar" | "organization_logo",
  bytes = jpeg,
  contentType = "image/jpeg"
) {
  const ticket = await assets.request({ kind, mimeType: contentType, sizeBytes: bytes.byteLength });
  memory.upload(
    { bucket: "uploads", key: ticket.stagingKey },
    { contentType, sizeBytes: bytes.byteLength, bytes }
  );
  return ticket.stagingKey;
}

beforeAll(async () => {
  jpeg = new Uint8Array(
    await sharp({ create: { width: 900, height: 600, channels: 3, background: "#c33" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
  );
  database = await createTestDatabase();
  const users = await database.db
    .insert(usersTable)
    .values([
      { email: "owner@example.test", name: "Owner", image: "https://lh3.example.test/me.png" },
      { email: "member@example.test", name: "Member" }
    ])
    .returning();
  const [ownerUser, memberUser] = users;
  if (!ownerUser || !memberUser) throw new Error("failed to seed users");
  const [organization] = await database.db
    .insert(organizationsTable)
    .values({ name: "Org", slug: "public-assets-org", userId: ownerUser.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  owner = scopeFor(ownerUser, organization.id, "owner");
  member = scopeFor(memberUser, organization.id, "member");
}, 30_000);

afterAll(async () => {
  await database.close();
});

beforeEach(() => {
  memory = createMemoryObjectStore("uploads");
});

describe("createPublicAssets", () => {
  it("publishes an avatar as a cacheable square WebP and replaces only assets it published", async () => {
    const assets = assetsFor(owner);
    const firstKey = await staged(assets, "avatar");

    const first = await assets.confirm("avatar", firstKey);

    expect(first.avatarUrl).toMatch(
      new RegExp(`^${BASE_URL}/avatars/${owner.userId}/[0-9a-f-]{36}\\.webp$`)
    );
    const publishedKey = first.avatarUrl?.slice(BASE_URL.length + 1) ?? "";
    expect(memory.stat({ bucket: "public", key: publishedKey })).toMatchObject({
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable"
    });
    const published = await sharp(
      memory.stat({ bucket: "public", key: publishedKey })?.bytes
    ).metadata();
    expect([published.width, published.height, published.exif]).toEqual([256, 256, undefined]);
    // The staged upload is gone, and the replaced OAuth avatar was not ours to delete.
    expect(memory.keys()).toEqual([publishedKey]);

    const second = await assets.confirm("avatar", await staged(assets, "avatar"));

    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    expect(memory.keys()).toEqual([second.avatarUrl?.slice(BASE_URL.length + 1)]);
    expect(await assets.current()).toMatchObject({ avatarUrl: second.avatarUrl });
  });

  it("lets only an admin or owner change the organization logo", async () => {
    await expect(
      assetsFor(member).request({ kind: "organization_logo", mimeType: "image/png", sizeBytes: 10 })
    ).rejects.toThrow("admin role required");

    const logo = await assetsFor(owner).confirm(
      "organization_logo",
      await staged(assetsFor(owner), "organization_logo")
    );

    expect(logo.organizationLogoUrl).toMatch(
      `${BASE_URL}/organization-logos/${owner.organizationId}/`
    );
    expect(await assetsFor(member).current()).toMatchObject({
      organizationLogoUrl: logo.organizationLogoUrl
    });
  });

  it("never deletes another owner's image that the replaced url points at", async () => {
    const victimKey = `avatars/${member.userId}/victim.webp`;
    memory.upload(
      { bucket: "public", key: victimKey },
      { contentType: "image/webp", sizeBytes: 8, bytes: new Uint8Array(8) }
    );
    await database.db
      .update(usersTable)
      .set({ image: `${BASE_URL}/${victimKey}` })
      .where(eq(usersTable.id, owner.userId));
    const assets = assetsFor(owner);

    const replaced = await assets.confirm("avatar", await staged(assets, "avatar"));

    expect(memory.keys().sort()).toEqual(
      [victimKey, replaced.avatarUrl?.slice(BASE_URL.length + 1)].sort()
    );
  });

  it("refuses a staging key issued to another user", async () => {
    const othersKey = await staged(assetsFor(member), "avatar");
    const [before] = await database.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, owner.userId));

    await expect(assetsFor(owner).confirm("avatar", othersKey)).rejects.toThrow(
      "public asset upload not found"
    );

    const [after] = await database.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, owner.userId));
    expect(after?.image).toBe(before?.image);
  });

  it("deletes a staged upload whose bytes are not the claimed image type", async () => {
    const assets = assetsFor(owner);
    const key = await staged(
      assets,
      "avatar",
      new TextEncoder().encode("<svg onload=x>"),
      "image/png"
    );

    await expect(assets.confirm("avatar", key)).rejects.toThrow("does not match claimed type");

    expect(memory.keys()).toEqual([]);
  });

  it("is off when no public bucket is configured", async () => {
    await expect(
      assetsFor(owner, null).request({ kind: "avatar", mimeType: "image/png", sizeBytes: 10 })
    ).rejects.toThrow("public assets are not configured");
  });
});
