export interface PersistenceAdapter {
  getString: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<void>;
  setString: (key: string, value: string) => Promise<void>;
}

export interface SyncKeyValueStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export interface AsyncKeyValueStorage {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function createMemoryPersistenceAdapter(
  entries: Iterable<readonly [string, string]> = []
): PersistenceAdapter {
  const values = new Map(entries);

  return {
    async getString(key) {
      return values.get(key) ?? null;
    },
    async remove(key) {
      values.delete(key);
    },
    async setString(key, value) {
      values.set(key, value);
    }
  };
}

export function createSyncStoragePersistenceAdapter(
  getStorage: () => SyncKeyValueStorage | null
): PersistenceAdapter {
  return {
    async getString(key) {
      return getStorage()?.getItem(key) ?? null;
    },
    async remove(key) {
      getStorage()?.removeItem(key);
    },
    async setString(key, value) {
      getStorage()?.setItem(key, value);
    }
  };
}

export function createAsyncStoragePersistenceAdapter(
  storage: AsyncKeyValueStorage
): PersistenceAdapter {
  return {
    getString(key) {
      return storage.getItem(key);
    },
    remove(key) {
      return storage.removeItem(key);
    },
    setString(key, value) {
      return storage.setItem(key, value);
    }
  };
}

export async function getJsonValue<T>(adapter: PersistenceAdapter, key: string): Promise<T | null> {
  const raw = await adapter.getString(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJsonValue<T>(
  adapter: PersistenceAdapter,
  key: string,
  value: T | null
): Promise<void> {
  if (value === null) {
    await adapter.remove(key);
    return;
  }

  await adapter.setString(key, JSON.stringify(value));
}

export function getJsonValueSync<T>(storage: SyncKeyValueStorage | null, key: string): T | null {
  const raw = storage?.getItem(key) ?? null;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJsonValueSync<T>(
  storage: SyncKeyValueStorage | null,
  key: string,
  value: T | null
): void {
  if (!storage) {
    return;
  }

  if (value === null) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}
