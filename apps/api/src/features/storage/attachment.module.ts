import type { AuditEventInput } from "@repo/auth/audit";
import type { AttachmentEntityType, File } from "@repo/db";
import { todosTable } from "@repo/db/schema";
import type { Logger } from "@repo/logger";
import {
  buildStorageKey,
  contentDisposition,
  matchesFileSignature,
  STORAGE_DEFAULTS,
  validateFile
} from "@repo/storage";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { sanitizeImage } from "./attachment.image";
import { objectRefsOf, thumbnailRef, type ObjectStore } from "./attachment.store";
import {
  createFileRecord,
  deleteFilesByEntity,
  getFileById,
  listFiles,
  listFilesByEntityIds,
  updateFileStatus
} from "./storage.adapter";
import { STORAGE_CONFIG } from "./storage.definition";
import type { FilesFilterInput, RequestUploadInput } from "./storage.type";
import type { Connection, PageInput, ScopedData } from "../../context.data";
import { formatLoggableError } from "../../observability";
import type { TodoAttachments } from "../todos/todos.module";

const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const satisfies Record<string, AttachmentEntityType>;

export interface AttachmentModuleDeps {
  data: ScopedData;
  logger: Pick<Logger, "warn">;
  recordAuditEvent: (event: AuditEventInput) => Promise<void>;
  store: ObjectStore;
}

/**
 * Every Attachment of one request's Authenticated Organization Scope: its row
 * and its stored object together. Each object call uses the `{ bucket, key }`
 * its row records. It is also the Todo module's `TodoAttachments`.
 */
export interface Attachments extends TodoAttachments {
  get: (id: string) => Promise<File | null>;
  list: (filter: FilesFilterInput, page: PageInput) => Promise<Connection<File>>;
  /** The uploaded Attachments of the given Todos, unpaginated (for the batch loader). */
  listByTodoIds: (todoIds: readonly string[]) => Promise<File[]>;
  /**
   * A presigned GET for an uploaded Attachment, null for any other status.
   * Images open inline; every other type downloads as a file.
   */
  downloadUrl: (
    file: Pick<File, "bucket" | "key" | "status" | "mimeType" | "originalName">
  ) => Promise<string | null>;
  /** A presigned GET for an uploaded image Attachment's WebP thumbnail; null otherwise. */
  thumbnailUrl: (
    file: Pick<File, "bucket" | "key" | "status" | "mimeType">
  ) => Promise<string | null>;
  /**
   * Validates the file, checks that a `todo` target is a Todo in the Active
   * Organization (`attachment target not found`), records a pending row, and
   * presigns its upload.
   */
  request: (
    input: RequestUploadInput
  ) => Promise<{ fileId: string; uploadUrl: string; key: string; expiresIn: number }>;
  /**
   * Marks a pending Attachment uploaded once its object exists and its size,
   * type, and leading bytes match the claim. An image is re-encoded without
   * metadata and gets a thumbnail. An object that does not match, or an image
   * that cannot be processed, is deleted and its row marked deleted, so a
   * rejected upload leaves nothing.
   */
  confirm: (id: string) => Promise<File>;
  /** Deletes the object, logging a failure, then marks the row deleted. */
  delete: (id: string) => Promise<boolean>;
}

export function createAttachments({
  data,
  logger,
  recordAuditEvent,
  store
}: AttachmentModuleDeps): Attachments {
  async function requireFile(id: string): Promise<File> {
    const file = await getFileById(data, id);

    if (!file) {
      throw new Error("file not found");
    }

    return file;
  }

  // The target's own table, read through the scope: depending on the Todo
  // module here would make the two modules need each other.
  async function todoExists(id: string): Promise<boolean> {
    const todos = await data.selectFrom(todosTable, eq(todosTable.id, id)).limit(1);
    return todos.length > 0;
  }

  async function removeObject(file: File, message: string): Promise<void> {
    try {
      await Promise.all(objectRefsOf(file).map((ref) => store.delete(ref)));
    } catch (err) {
      // `error`, not `err`: pino's default serializer would copy every
      // enumerable property of the error onto the record. See observability.ts.
      logger.warn({ error: formatLoggableError(err), key: file.key }, message);
    }
  }

  /** Replaces an uploaded image with its sanitized copy and writes its thumbnail; returns the new size. */
  async function processImage(file: File): Promise<number> {
    const original = await store.get(file);

    if (!original) {
      throw new Error("object could not be read");
    }

    const { image, thumbnail } = await sanitizeImage(original, file.mimeType);
    await store.put(file, image, file.mimeType);
    await store.put(thumbnailRef(file), thumbnail, "image/webp");
    return image.byteLength;
  }

  /** Why an uploaded object does not match its pending row, or null when it does. */
  async function rejectionOf(
    file: File,
    metadata: { contentType?: string | undefined; sizeBytes?: number | undefined }
  ): Promise<string | null> {
    // Re-apply default policy to claimed metadata (size + MIME allowlist + extension).
    const validation = validateFile({
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      originalName: file.originalName
    });

    if (!validation.valid) {
      return `file validation failed: ${validation.errors.join(", ")}`;
    }

    if (
      typeof metadata.sizeBytes === "number" &&
      metadata.sizeBytes > STORAGE_DEFAULTS.maxFileSizeBytes
    ) {
      return `uploaded object size ${metadata.sizeBytes} exceeds maximum ${STORAGE_DEFAULTS.maxFileSizeBytes} bytes`;
    }

    if (typeof metadata.sizeBytes === "number" && metadata.sizeBytes > file.sizeBytes) {
      return `uploaded object size ${metadata.sizeBytes} exceeds claimed size ${file.sizeBytes} bytes`;
    }

    if (
      metadata.contentType &&
      metadata.contentType.split(";")[0]?.trim().toLowerCase() !== file.mimeType.toLowerCase()
    ) {
      return `uploaded content type ${metadata.contentType} does not match claimed type ${file.mimeType}`;
    }

    const prefix = await store.readPrefix(file, STORAGE_DEFAULTS.signatureSampleBytes);

    if (!prefix || !matchesFileSignature(file.mimeType, prefix)) {
      return `uploaded content does not match claimed type ${file.mimeType}`;
    }

    return null;
  }

  return {
    get: (id) => getFileById(data, id),
    list: (filter, page) => listFiles(data, filter, page),
    listByTodoIds: (todoIds) =>
      listFilesByEntityIds(data, ATTACHMENT_ENTITY_TYPES.todo, [...todoIds], "uploaded"),
    async thumbnailUrl(file) {
      return file.status === "uploaded" && file.mimeType.startsWith("image/")
        ? store.presignDownload(thumbnailRef(file), "inline")
        : null;
    },
    async downloadUrl(file) {
      return file.status === "uploaded"
        ? store.presignDownload(file, contentDisposition(file.mimeType, file.originalName))
        : null;
    },
    async request(input) {
      // Scope first, so a request without one fails on scope, not on input.
      const { organizationId } = data.stamp();
      const validation = validateFile({
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalName: input.originalName
      });

      if (!validation.valid) {
        throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
      }

      // The client names the Attachment's target, so the server proves it is a
      // Todo in the Active Organization before linking it.
      if (
        input.entityType === ATTACHMENT_ENTITY_TYPES.todo &&
        (!input.entityId || !(await todoExists(input.entityId)))
      ) {
        throw new Error("attachment target not found");
      }

      const fileId = randomUUID();
      const ref = store.place(
        buildStorageKey({
          organizationId,
          entityType: input.entityType ?? STORAGE_CONFIG.defaultEntityType,
          fileId,
          originalName: input.originalName
        })
      );
      const file = await createFileRecord(data, {
        id: fileId,
        key: ref.key,
        bucket: ref.bucket,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null
      });
      const upload = await store.presignUpload(ref, {
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes
      });

      return { fileId: file.id, uploadUrl: upload.url, key: ref.key, expiresIn: upload.expiresIn };
    },
    async confirm(id) {
      const file = await requireFile(id);

      if (file.status !== "pending") {
        throw new Error(`file status is ${file.status}, expected pending`);
      }

      const metadata = await store.head(file);

      if (!metadata) {
        // Not terminal: the client may still be uploading, so it can confirm again.
        throw new Error("file has not been uploaded to storage");
      }

      let rejection = await rejectionOf(file, metadata);
      let sizeBytes = file.sizeBytes;

      if (!rejection && file.mimeType.startsWith("image/")) {
        try {
          sizeBytes = await processImage(file);
        } catch (err) {
          rejection = `image could not be processed: ${err instanceof Error ? err.message : "unknown error"}`;
        }
      }

      if (rejection) {
        await removeObject(file, "failed to delete rejected upload from S3");
        await updateFileStatus(data, file.id, "deleted");
        throw new Error(rejection);
      }

      return updateFileStatus(data, file.id, "uploaded", { sizeBytes });
    },
    async delete(id) {
      const file = await requireFile(id);

      await removeObject(file, "failed to delete object from S3");
      await updateFileStatus(data, file.id, "deleted");
      // The scope's Organization and user, never the client's.
      const { organizationId, userId } = data.stamp("userId");
      await recordAuditEvent({
        action: "attachment_deleted",
        actorUserId: userId,
        metadata: { originalName: file.originalName },
        organizationId,
        targetId: file.id
      });
      return true;
    },
    async detach(todoId) {
      const files = await deleteFilesByEntity(data, ATTACHMENT_ENTITY_TYPES.todo, todoId);

      return {
        purge: async () => {
          await Promise.all(
            files.flatMap(objectRefsOf).map(async (ref) => {
              try {
                await store.delete(ref);
              } catch (err) {
                // A failure leaves an orphaned object (issue #602).
                logger.warn(
                  { error: formatLoggableError(err), todoId },
                  "failed to clean up todo attachments"
                );
              }
            })
          );
        }
      };
    }
  };
}
