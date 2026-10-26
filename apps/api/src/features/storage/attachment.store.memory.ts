import type { ObjectRef, ObjectStore } from "./attachment.store";

interface StoredObject {
  contentType: string;
  sizeBytes: number;
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
    presignDownload: async (ref) => `memory://${id(ref)}`,
    head: async (ref) => {
      const stored = objects.get(id(ref));
      return stored ? { contentType: stored.contentType, sizeBytes: stored.sizeBytes } : null;
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
    keys: () => [...objects.values()].map((stored) => stored.key).sort()
  };
}
