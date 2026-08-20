import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { db, filesTable, type File } from "@repo/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";

import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput } from "./storage.type";

export async function createFileRecord(
  scope: AuthenticatedOrganizationScope,
  input: {
    id: string;
    key: string;
    bucket: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    entityType: string | null;
    entityId: string | null;
  }
): Promise<File> {
  const files = await db
    .insert(filesTable)
    .values({
      id: input.id,
      key: input.key,
      bucket: input.bucket,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: scope.userId,
      organizationId: scope.organizationId,
      entityType: input.entityType,
      entityId: input.entityId
    })
    .returning();

  const file = files[0];

  if (!file) {
    throw new Error("failed to create file record");
  }

  return file;
}

export async function getFileById(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<File | null> {
  const files = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, id), eq(filesTable.organizationId, scope.organizationId)))
    .limit(1);

  return files[0] ?? null;
}

export async function listFiles(
  scope: AuthenticatedOrganizationScope,
  filter: FilesFilterInput
): Promise<File[]> {
  const limit = Math.min(
    filter.limit ?? STORAGE_CONFIG.pagination.defaultLimit,
    STORAGE_CONFIG.pagination.maxLimit
  );
  const offset = filter.offset ?? 0;

  const conditions = [eq(filesTable.organizationId, scope.organizationId)];

  if (filter.entityType) {
    conditions.push(eq(filesTable.entityType, filter.entityType));
  }

  if (filter.entityId) {
    conditions.push(eq(filesTable.entityId, filter.entityId));
  }

  if (filter.status) {
    conditions.push(eq(filesTable.status, filter.status));
  }

  return db
    .select()
    .from(filesTable)
    .where(and(...conditions))
    .orderBy(desc(filesTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function listFilesByEntityIds(
  scope: AuthenticatedOrganizationScope,
  entityType: string,
  entityIds: string[],
  status: "pending" | "uploaded" | "deleted"
): Promise<File[]> {
  if (entityIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(filesTable)
    .where(
      and(
        eq(filesTable.organizationId, scope.organizationId),
        eq(filesTable.entityType, entityType),
        inArray(filesTable.entityId, entityIds),
        eq(filesTable.status, status)
      )
    )
    .orderBy(desc(filesTable.createdAt));
}

export async function updateFileStatus(
  scope: AuthenticatedOrganizationScope,
  id: string,
  status: "pending" | "uploaded" | "deleted"
): Promise<File> {
  const files = await db
    .update(filesTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(filesTable.id, id), eq(filesTable.organizationId, scope.organizationId)))
    .returning();

  const file = files[0];

  if (!file) {
    throw new Error("file not found");
  }

  return file;
}

export async function deleteFilesByEntity(
  scope: AuthenticatedOrganizationScope,
  entityType: string,
  entityId: string
): Promise<File[]> {
  return db
    .update(filesTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(
      and(
        eq(filesTable.organizationId, scope.organizationId),
        eq(filesTable.entityType, entityType),
        eq(filesTable.entityId, entityId),
        ne(filesTable.status, "deleted")
      )
    )
    .returning();
}
