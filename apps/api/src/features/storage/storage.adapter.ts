import { db, filesTable, type File } from "@repo/db";
import { and, desc, eq, ne } from "drizzle-orm";

import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput } from "./storage.type";

export async function createFileRecord(input: {
  id: string;
  key: string;
  bucket: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  organizationId: string;
  entityType: string | null;
  entityId: string | null;
}): Promise<File> {
  const files = await db
    .insert(filesTable)
    .values({
      id: input.id,
      key: input.key,
      bucket: input.bucket,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
      organizationId: input.organizationId,
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

export async function getFileById(organizationId: string, id: string): Promise<File | null> {
  const files = await db
    .select()
    .from(filesTable)
    .where(and(eq(filesTable.id, id), eq(filesTable.organizationId, organizationId)))
    .limit(1);

  return files[0] ?? null;
}

export async function listFiles(organizationId: string, filter: FilesFilterInput): Promise<File[]> {
  const limit = Math.min(
    filter.limit ?? STORAGE_CONFIG.pagination.defaultLimit,
    STORAGE_CONFIG.pagination.maxLimit
  );
  const offset = filter.offset ?? 0;

  const conditions = [eq(filesTable.organizationId, organizationId)];

  if (filter.entityType) {
    conditions.push(eq(filesTable.entityType, filter.entityType));
  }

  if (filter.entityId) {
    conditions.push(eq(filesTable.entityId, filter.entityId));
  }

  if (filter.status) {
    conditions.push(eq(filesTable.status, filter.status as "pending" | "uploaded" | "deleted"));
  }

  return db
    .select()
    .from(filesTable)
    .where(and(...conditions))
    .orderBy(desc(filesTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateFileStatus(
  organizationId: string,
  id: string,
  status: "pending" | "uploaded" | "deleted"
): Promise<File> {
  const files = await db
    .update(filesTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(filesTable.id, id), eq(filesTable.organizationId, organizationId)))
    .returning();

  const file = files[0];

  if (!file) {
    throw new Error("file not found");
  }

  return file;
}

export async function deleteFilesByEntity(
  organizationId: string,
  entityType: string,
  entityId: string
): Promise<File[]> {
  return db
    .update(filesTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(
      and(
        eq(filesTable.organizationId, organizationId),
        eq(filesTable.entityType, entityType),
        eq(filesTable.entityId, entityId),
        ne(filesTable.status, "deleted")
      )
    )
    .returning();
}
