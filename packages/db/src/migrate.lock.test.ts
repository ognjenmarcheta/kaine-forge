import { describe, expect, it } from "vitest";

import { MIGRATION_ADVISORY_LOCK_KEY, withMigrationLock } from "./migrate.lock";

function createFakePool() {
  const events: string[] = [];
  const client = {
    query(text: string, values?: readonly number[]): Promise<void> {
      events.push(`${text} ${JSON.stringify(values)}`);
      return Promise.resolve();
    },
    release(): void {
      events.push("release");
    }
  };
  const pool = {
    connect: () => {
      events.push("connect");
      return Promise.resolve(client);
    }
  };
  return { client, events, pool };
}

const lock = `select pg_advisory_lock($1) [${MIGRATION_ADVISORY_LOCK_KEY}]`;
const unlock = `select pg_advisory_unlock($1) [${MIGRATION_ADVISORY_LOCK_KEY}]`;

describe("withMigrationLock", () => {
  it("runs the task on the locked client between lock and unlock", async () => {
    const { client, events, pool } = createFakePool();

    await withMigrationLock(pool, (taskClient) => {
      expect(taskClient).toBe(client);
      events.push("migrate");
      return Promise.resolve();
    });

    expect(events).toEqual(["connect", lock, "migrate", unlock, "release"]);
  });

  it("unlocks and releases the client when the task throws", async () => {
    const { events, pool } = createFakePool();

    await expect(
      withMigrationLock(pool, () => Promise.reject(new Error("migration failed")))
    ).rejects.toThrow("migration failed");

    expect(events).toEqual(["connect", lock, unlock, "release"]);
  });
});
