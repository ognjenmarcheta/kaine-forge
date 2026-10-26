import type { ObjectRef, ObjectStore } from "./attachment.store";

interface StoredObject {
  contentType: string;
  sizeBytes: number;
  cacheControl?: string;
  lastModified?: Date;
  /** The object's bytes, as far as a test needs them. */
  bytes?: Uint8Array;
}

/**
 * An in-memory object store for tests and evaluations. `upload` stands in for
 * the client's PUT to a presigned URL; `keys` lists what is stored.
 */
export function createMemoryObjectStore(bucket = "memory") {
  const objects = new Map<string, StoredObject & { key: string }>();
  const id = ({ bucket: refBucket, key }: ObjectRef) => `${refBucket}/${key}`;

  const store: ObjectStore = {
    place: (key) => ({ bucket, key }),
    presignUpload: async (ref) => ({ url: `memory://${id(ref)}?upload`, expiresIn: 900 }),
    presignDownload: async (ref, contentDisposition) =>
      `memory://${id(ref)}?disposition=${encodeURIComponent(contentDisposition)}`,
    head: async (ref) => {
      const stored = objects.get(id(ref));
      return stored ? { contentType: stored.contentType, sizeBytes: stored.sizeBytes } : null;
    },
    get: async (ref) => objects.get(id(ref))?.bytes ?? null,
    put: async (ref, body, contentType, cacheControl) => {
      objects.set(id(ref), {
        contentType,
        sizeBytes: body.byteLength,
        bytes: body,
        key: ref.key,
        lastModified: new Date(),
        ...(cacheControl ? { cacheControl } : {})
      });
    },
    listBefore: async (prefix, before, limit) =>
      [...objects.entries()]
        .filter(
          ([objectId, stored]) =>
            objectId.startsWith(`${bucket}/${prefix}`) &&
            (stored.lastModified ?? new Date(0)) < before
        )
        .slice(0, limit)
        .map(([, stored]) => ({ bucket, key: stored.key })),
    readPrefix: async (ref, bytes) => {
      const stored = objects.get(id(ref));
      return stored ? (stored.bytes ?? new Uint8Array()).slice(0, bytes) : null;
    },
    delete: async (ref) => {
      objects.delete(id(ref));
    }
  };

  return {
    ...store,
    upload: (ref: ObjectRef, object: StoredObject) => {
      objects.set(id(ref), { ...object, key: ref.key });
    },
    keys: () => [...objects.values()].map((stored) => stored.key).sort(),
    /** What is stored at `ref`, for assertions on content type and cache headers. */
    stat: (ref: ObjectRef) => objects.get(id(ref)) ?? null
  };
}
