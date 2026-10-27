import { describe, expect, it } from "vitest";

import { MIGRATION_ADVISORY_LOCK_KEY, withMigrationLock } from "./migrate.lock";

function createFakePool(failingQuery?: string) {
  const events: string[] = [];
  const client = {
    query(text: string, values?: readonly number[]): Promise<void> {
      events.push(`${text} ${JSON.stringify(values)}`);
      return text === failingQuery ? Promise.reject(new Error("query failed")) : Promise.resolve();
    },
    release(destroy?: boolean): void {
      events.push(destroy ? "destroy" : "release");
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

  it("destroys the client instead of pooling it when unlock fails", async () => {
    const { events, pool } = createFakePool("select pg_advisory_unlock($1)");

    await expect(withMigrationLock(pool, () => Promise.resolve())).rejects.toThrow("query failed");

    expect(events).toEqual(["connect", lock, unlock, "destroy"]);
  });
});
