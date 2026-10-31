import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SYNC_TRIGGERS_SQL } from "../sync.triggers";
import { createTestDatabase, type TestDatabase } from "../testing";

const migrationsFolder = path.join(import.meta.dirname, "../../drizzle");

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ORG_ID = "00000000-0000-4000-8000-0000000000a2";
const OLD_NOTE_ID = "00000000-0000-4000-8000-0000000000b1";
const OLD_TODO_ID = "00000000-0000-4000-8000-0000000000c1";

async function readMigrations(): Promise<string[]> {
  const journal: unknown = JSON.parse(
    await readFile(path.join(migrationsFolder, "meta/_journal.json"), "utf8")
  );
  if (
    typeof journal !== "object" ||
    journal === null ||
    !("entries" in journal) ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error("unexpected drizzle journal shape");
  }
  const entries: unknown[] = journal.entries;
  return Promise.all(
    entries.map((entry) => {
      if (typeof entry !== "object" || entry === null || !("tag" in entry)) {
        throw new Error("unexpected drizzle journal entry");
      }
      if (typeof entry.tag !== "string") {
        throw new Error("unexpected drizzle journal tag");
      }
      return readFile(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8");
    })
  );
}

describe("sync version migration", () => {
  const client = new PGlite();

  async function versions(table: "notes" | "todos", organizationId = ORG_ID) {
    const { rows } = await client.query<{ id: string; sync_version: number }>(
      `SELECT id, sync_version::int AS sync_version FROM ${table}
       WHERE organization_id = $1 ORDER BY sync_version`,
      [organizationId]
    );
    return rows;
  }

  async function counter(organizationId = ORG_ID): Promise<number | undefined> {
    const { rows } = await client.query<{ version: number }>(
      "SELECT version::int AS version FROM organization_sync_versions WHERE organization_id = $1",
      [organizationId]
    );
    return rows[0]?.version;
  }

  beforeAll(async () => {
    const migrations = await readMigrations();
    // Found by content: the tag changes when main gains a migration first.
    const syncIndex = migrations.findIndex((sql) => sql.includes('"sync_next_version"'));
    expect(syncIndex).toBeGreaterThan(0);

    for (const sql of migrations.slice(0, syncIndex)) {
      await client.exec(sql);
    }
    // Rows from before the migration, in one Organization: a note created
    // after the todo, so creation order spans both tables.
    await client.exec(`
      INSERT INTO users (id, email, name) VALUES
        ('${USER_ID}', 'owner@example.test', 'Owner'),
        ('${OTHER_USER_ID}', 'member@example.test', 'Member');
      INSERT INTO organizations (id, name, slug) VALUES
        ('${ORG_ID}', 'Org', 'org'),
        ('${OTHER_ORG_ID}', 'Other', 'other');
      INSERT INTO todos (id, title, user_id, organization_id, created_at) VALUES
        ('${OLD_TODO_ID}', 'Old todo', '${USER_ID}', '${ORG_ID}', '2026-01-01T00:00:00Z');
      INSERT INTO notes (id, title, user_id, organization_id, created_at) VALUES
        ('${OLD_NOTE_ID}', 'Old note', '${USER_ID}', '${ORG_ID}', '2026-01-02T00:00:00Z');
    `);

    for (const sql of migrations.slice(syncIndex)) {
      await client.exec(sql);
    }
    // Applies every migration on PGlite, which takes over 10 s on a loaded CI runner.
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it("numbers existing rows per Organization in creation order", async () => {
    expect(await versions("todos")).toEqual([{ id: OLD_TODO_ID, sync_version: 1 }]);
    expect(await versions("notes")).toEqual([{ id: OLD_NOTE_ID, sync_version: 2 }]);
    expect(await counter()).toBe(2);
    expect(await counter(OTHER_ORG_ID)).toBeUndefined();
  });

  it("gives every write in an Organization the next version, apart from other Organizations", async () => {
    await client.exec(`
      INSERT INTO todos (title, user_id, organization_id)
        VALUES ('Other org todo', '${USER_ID}', '${OTHER_ORG_ID}');
      UPDATE todos SET title = 'Renamed' WHERE id = '${OLD_TODO_ID}';
      UPDATE notes SET title = 'Renamed' WHERE id = '${OLD_NOTE_ID}';
    `);

    expect(await versions("todos")).toEqual([{ id: OLD_TODO_ID, sync_version: 3 }]);
    expect(await versions("notes")).toEqual([{ id: OLD_NOTE_ID, sync_version: 4 }]);
    expect(await counter()).toBe(4);
    expect(await counter(OTHER_ORG_ID)).toBe(1);
  });

  it("versions a todo the note_id cascade changes, and records the deleted note", async () => {
    await client.exec(`UPDATE todos SET note_id = '${OLD_NOTE_ID}' WHERE id = '${OLD_TODO_ID}'`);
    const before = await counter();

    await client.exec(`DELETE FROM notes WHERE id = '${OLD_NOTE_ID}'`);

    const { rows: tombstones } = await client.query<{ entity: string; sync_version: number }>(
      `SELECT entity, sync_version::int AS sync_version FROM sync_tombstones
       WHERE entity_id = $1`,
      [OLD_NOTE_ID]
    );
    const [todo] = await versions("todos");
    // The cascade and the delete each took a version after `before`.
    expect(todo?.sync_version).toBeGreaterThan(before ?? 0);
    expect(tombstones).toEqual([{ entity: "note", sync_version: expect.any(Number) }]);
    expect(new Set([todo?.sync_version, tombstones[0]?.sync_version]).size).toBe(2);
    expect(await counter()).toBe((before ?? 0) + 2);
  });

  it("records Tombstones for rows a deleted user's cascade removes", async () => {
    await client.exec(`
      INSERT INTO todos (id, title, user_id, organization_id) VALUES
        ('00000000-0000-4000-8000-0000000000c2', 'Member todo', '${OTHER_USER_ID}', '${ORG_ID}');
      DELETE FROM users WHERE id = '${OTHER_USER_ID}';
    `);

    const { rows } = await client.query<{ entity: string }>(
      "SELECT entity FROM sync_tombstones WHERE entity_id = '00000000-0000-4000-8000-0000000000c2'"
    );
    expect(rows).toEqual([{ entity: "todo" }]);
  });

  it("gives a Todo a new version when one of its Attachments is added or changes", async () => {
    const [before] = await versions("todos");

    await client.exec(`
      INSERT INTO files (id, key, bucket, original_name, mime_type, size_bytes, organization_id, entity_type, entity_id)
      VALUES ('00000000-0000-4000-8000-0000000000f1', 'k', 'b', 'a.txt', 'text/plain', 1,
              '${ORG_ID}', 'todo', '${OLD_TODO_ID}');
    `);
    const [afterInsert] = await versions("todos");
    await client.exec(
      "UPDATE files SET status = 'uploaded' WHERE id = '00000000-0000-4000-8000-0000000000f1'"
    );
    const [afterUpload] = await versions("todos");

    expect(afterInsert?.sync_version).toBeGreaterThan(before?.sync_version ?? 0);
    expect(afterUpload?.sync_version).toBeGreaterThan(afterInsert?.sync_version ?? 0);
  });

  it("deletes an Organization with its rows, counter, and Tombstones", async () => {
    // A linked todo, so the cascade also runs note_id SET NULL mid-delete.
    await client.exec(`
      INSERT INTO notes (id, title, user_id, organization_id) VALUES
        ('00000000-0000-4000-8000-0000000000b2', 'Linked', '${USER_ID}', '${ORG_ID}');
      INSERT INTO todos (title, user_id, organization_id, note_id) VALUES
        ('Linked todo', '${USER_ID}', '${ORG_ID}', '00000000-0000-4000-8000-0000000000b2');
    `);

    await client.exec(`DELETE FROM organizations WHERE id = '${ORG_ID}'`);

    const { rows } = await client.query<{ rows: number }>(
      `SELECT (SELECT count(*) FROM todos WHERE organization_id = $1)
            + (SELECT count(*) FROM notes WHERE organization_id = $1)
            + (SELECT count(*) FROM sync_tombstones WHERE organization_id = $1)
            + (SELECT count(*) FROM organization_sync_versions WHERE organization_id = $1)
            AS rows`,
      [ORG_ID]
    );
    expect(Number(rows[0]?.rows)).toBe(0);
  });
});

describe("sync triggers on a schema built by drizzle-kit push", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    // What a pushed schema lacks: push applies the tables, never a migration's
    // functions and triggers.
    await database.client.exec(`
      DROP TRIGGER "todos_sync_version" ON "todos";
      DROP TRIGGER "notes_sync_version" ON "notes";
      DROP TRIGGER "todos_sync_tombstone" ON "todos";
      DROP TRIGGER "notes_sync_tombstone" ON "notes";
      DROP TRIGGER "files_sync_todo_version" ON "files";
      DROP FUNCTION "sync_stamp_version"(), "sync_record_tombstone"(), "sync_next_version"(uuid),
        "sync_touch_attachment_todos"();
      INSERT INTO users (id, email, name) VALUES ('${USER_ID}', 'owner@example.test', 'Owner');
      INSERT INTO organizations (id, name, slug) VALUES ('${ORG_ID}', 'Org', 'org');
      INSERT INTO todos (title, user_id, organization_id) VALUES
        ('Unversioned 1', '${USER_ID}', '${ORG_ID}'),
        ('Unversioned 2', '${USER_ID}', '${ORG_ID}');
    `);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("installs idempotently, versions earlier rows, and versions later writes and deletes", async () => {
    await database.client.exec(SYNC_TRIGGERS_SQL);
    await database.client.exec(SYNC_TRIGGERS_SQL);
    await database.client.exec(`
      INSERT INTO notes (title, user_id, organization_id) VALUES ('Later', '${USER_ID}', '${ORG_ID}');
      DELETE FROM todos WHERE title = 'Unversioned 1';
    `);

    const { rows } = await database.client.query<{ version: number }>(
      `SELECT sync_version::int AS version FROM todos
       UNION ALL SELECT sync_version::int FROM notes
       UNION ALL SELECT sync_version::int FROM sync_tombstones
       ORDER BY version`
    );
    // The first install stamps both todos as 1 and 2 in any order, and the
    // second finds none left at 0; then the note takes 3 and the delete 4.
    const [remaining, ...later] = rows.map((row) => row.version);
    expect([1, 2]).toContain(remaining);
    expect(later).toEqual([3, 4]);
  });
});
