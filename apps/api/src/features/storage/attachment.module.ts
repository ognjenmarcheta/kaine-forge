import type { AttachmentEntityType, File } from "@repo/db";
import { todosTable } from "@repo/db/schema";
import type { Logger } from "@repo/logger";
import { buildStorageKey, STORAGE_DEFAULTS, validateFile } from "@repo/storage";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { ObjectStore } from "./attachment.store";
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
import type { ScopedData } from "../../context.data";
import { formatLoggableError } from "../../observability";
import type { TodoAttachments } from "../todos/todos.module";

const ATTACHMENT_ENTITY_TYPES = {
  todo: "todo"
} as const satisfies Record<string, AttachmentEntityType>;

export interface AttachmentModuleDeps {
  data: ScopedData;
  logger: Pick<Logger, "warn">;
  store: ObjectStore;
}

/**
 * Every Attachment of one request's Authenticated Organization Scope: its row
 * and its stored object together. Each object call uses the `{ bucket, key }`
 * its row records. It is also the Todo module's `TodoAttachments`.
 */
export interface Attachments extends TodoAttachments {
  get: (id: string) => Promise<File | null>;
  list: (filter: FilesFilterInput) => Promise<File[]>;
  /** The uploaded Attachments of the given Todos, unpaginated (for the batch loader). */
  listByTodoIds: (todoIds: readonly string[]) => Promise<File[]>;
  /** A presigned GET for an uploaded Attachment; null for any other status. */
  downloadUrl: (file: Pick<File, "bucket" | "key" | "status">) => Promise<string | null>;
  /**
   * Validates the file, checks that a `todo` target is a Todo in the Active
   * Organization (`attachment target not found`), records a pending row, and
   * presigns its upload.
   */
  request: (
    input: RequestUploadInput
  ) => Promise<{ fileId: string; uploadUrl: string; key: string; expiresIn: number }>;
  /** Marks a pending Attachment uploaded once its object exists and matches the claim. */
  confirm: (id: string) => Promise<File>;
  /** Deletes the object, logging a failure, then marks the row deleted. */
  delete: (id: string) => Promise<boolean>;
}

export function createAttachments({ data, logger, store }: AttachmentModuleDeps): Attachments {
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

  return {
    get: (id) => getFileById(data, id),
    list: (filter) => listFiles(data, filter),
    listByTodoIds: (todoIds) =>
      listFilesByEntityIds(data, ATTACHMENT_ENTITY_TYPES.todo, [...todoIds], "uploaded"),
    async downloadUrl(file) {
      return file.status === "uploaded" ? store.presignDownload(file) : null;
    },
    async request(input) {
      // Scope first, so a request without one fails on scope, not on input.
      const { organizationId } = data.stamp();
      const validation = validateFile({ mimeType: input.mimeType, sizeBytes: input.sizeBytes }, {});

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
      const upload = await store.presignUpload(ref, input.mimeType);

      return { fileId: file.id, uploadUrl: upload.url, key: ref.key, expiresIn: upload.expiresIn };
    },
    async confirm(id) {
      const file = await requireFile(id);

      if (file.status !== "pending") {
        throw new Error(`file status is ${file.status}, expected pending`);
      }

      // Re-apply default policy to claimed metadata (size + MIME allowlist).
      const validation = validateFile({ mimeType: file.mimeType, sizeBytes: file.sizeBytes });

      if (!validation.valid) {
        throw new Error(`file validation failed: ${validation.errors.join(", ")}`);
      }

      const metadata = await store.head(file);

      if (!metadata) {
        throw new Error("file has not been uploaded to storage");
      }

      if (
        typeof metadata.sizeBytes === "number" &&
        metadata.sizeBytes > STORAGE_DEFAULTS.maxFileSizeBytes
      ) {
        throw new Error(
          `uploaded object size ${metadata.sizeBytes} exceeds maximum ${STORAGE_DEFAULTS.maxFileSizeBytes} bytes`
        );
      }

      if (typeof metadata.sizeBytes === "number" && metadata.sizeBytes > file.sizeBytes) {
        throw new Error(
          `uploaded object size ${metadata.sizeBytes} exceeds claimed size ${file.sizeBytes} bytes`
        );
      }

      if (
        metadata.contentType &&
        metadata.contentType.split(";")[0]?.trim().toLowerCase() !== file.mimeType.toLowerCase()
      ) {
        throw new Error(
          `uploaded content type ${metadata.contentType} does not match claimed type ${file.mimeType}`
        );
      }

      return updateFileStatus(data, file.id, "uploaded");
    },
    async delete(id) {
      const file = await requireFile(id);

      try {
        await store.delete(file);
      } catch (err) {
        // `error`, not `err`: pino's default serializer would copy every
        // enumerable property of the error onto the record. See observability.ts.
        logger.warn(
          { error: formatLoggableError(err), key: file.key },
          "failed to delete object from S3"
        );
      }

      await updateFileStatus(data, file.id, "deleted");
      return true;
    },
    async detach(todoId) {
      const files = await deleteFilesByEntity(data, ATTACHMENT_ENTITY_TYPES.todo, todoId);

      return {
        purge: async () => {
          await Promise.all(
            files.map(async (file) => {
              try {
                await store.delete(file);
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
