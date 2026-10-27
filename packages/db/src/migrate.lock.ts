/**
 * Session-level advisory lock key that serializes startup migrations across
 * API replicas. It must differ from every other advisory lock key in the
 * repo, such as the storage sweep key `7_461_201`.
 */
export const MIGRATION_ADVISORY_LOCK_KEY = 7_461_202;

export interface MigrationLockClient {
  query(text: string, values?: readonly number[]): Promise<unknown>;
  /** `destroy: true` closes the connection instead of returning it to the pool. */
  release(destroy?: boolean): void;
}

export interface MigrationLockPool<TClient extends MigrationLockClient> {
  connect(): Promise<TClient>;
}

/**
 * Takes one client from `pool`, holds the migration advisory lock on it while
 * `task` runs on that same client, then unlocks and releases it. A second
 * caller blocks until the first one unlocks. The lock is session-level, not
 * transaction-level, because the Drizzle migrator reads the last applied
 * migration outside its own transaction. When the unlock does not succeed,
 * the client is destroyed, so a pooled connection never keeps the lock.
 */
export async function withMigrationLock<TClient extends MigrationLockClient>(
  pool: MigrationLockPool<TClient>,
  task: (client: TClient) => Promise<void>
): Promise<void> {
  const client = await pool.connect();
  let unlocked = false;

  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);

    try {
      await task(client);
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
      unlocked = true;
    }
  } finally {
    client.release(!unlocked);
  }
}
