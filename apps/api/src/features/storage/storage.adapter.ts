import type { AttachmentEntityType, File } from "@repo/db";
import { filesTable } from "@repo/db/schema";
import { desc, eq, inArray, ne } from "drizzle-orm";

import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput } from "./storage.type";
import { clampPagination, type ScopedData } from "../../context.data";

export async function createFileRecord(
  data: ScopedData,
  input: {
    id: string;
    key: string;
    bucket: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    entityType: AttachmentEntityType | null;
    entityId: string | null;
  }
): Promise<File> {
  const files = await data
    .insert(filesTable)
    .values({
      ...data.stamp("uploadedBy"),
      id: input.id,
      key: input.key,
      bucket: input.bucket,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
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

export async function getFileById(data: ScopedData, id: string): Promise<File | null> {
  const files = await data.selectFrom(filesTable, eq(filesTable.id, id)).limit(1);

  return files[0] ?? null;
}

export async function listFiles(data: ScopedData, filter: FilesFilterInput): Promise<File[]> {
  const { limit, offset } = clampPagination(filter, STORAGE_CONFIG.pagination);

  return data
    .selectFrom(
      filesTable,
      filter.entityType ? eq(filesTable.entityType, filter.entityType) : undefined,
      filter.entityId ? eq(filesTable.entityId, filter.entityId) : undefined,
      filter.status ? eq(filesTable.status, filter.status) : undefined
    )
    .orderBy(desc(filesTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function listFilesByEntityIds(
  data: ScopedData,
  entityType: AttachmentEntityType,
  entityIds: string[],
  status: "pending" | "uploaded" | "deleted"
): Promise<File[]> {
  if (entityIds.length === 0) {
    return [];
  }

  return data
    .selectFrom(
      filesTable,
      eq(filesTable.entityType, entityType),
      inArray(filesTable.entityId, entityIds),
      eq(filesTable.status, status)
    )
    .orderBy(desc(filesTable.createdAt));
}

export async function updateFileStatus(
  data: ScopedData,
  id: string,
  status: "pending" | "uploaded" | "deleted"
): Promise<File> {
  const files = await data
    .update(filesTable, { status, updatedAt: new Date() }, eq(filesTable.id, id))
    .returning();

  const file = files[0];

  if (!file) {
    throw new Error("file not found");
  }

  return file;
}

export async function deleteFilesByEntity(
  data: ScopedData,
  entityType: AttachmentEntityType,
  entityId: string
): Promise<File[]> {
  return data
    .update(
      filesTable,
      { status: "deleted", updatedAt: new Date() },
      eq(filesTable.entityType, entityType),
      eq(filesTable.entityId, entityId),
      ne(filesTable.status, "deleted")
    )
    .returning();
}
