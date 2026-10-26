import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const migrationsFolder = path.join(import.meta.dirname, "../../drizzle");
const ENUM_MIGRATION = "0010_large_firestar";

async function readJournalTags(): Promise<string[]> {
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
  return journal.entries.map((entry: { tag: string }) => entry.tag);
}

async function applyMigration(client: PGlite, tag: string): Promise<void> {
  await client.exec(await readFile(path.join(migrationsFolder, `${tag}.sql`), "utf8"));
}

describe("files.entity_type enum migration", () => {
  const client = new PGlite();

  afterAll(async () => {
    await client.close();
  });

  it("maps unknown entity types to general and keeps known ones", async () => {
    const tags = await readJournalTags();
    const enumIndex = tags.indexOf(ENUM_MIGRATION);
    expect(enumIndex).toBeGreaterThan(0);

    for (const tag of tags.slice(0, enumIndex)) {
      await applyMigration(client, tag);
    }

    await client.exec(`
      INSERT INTO users (id, email, name) VALUES ('00000000-0000-4000-8000-000000000001', 'm@example.test', 'M');
      INSERT INTO organizations (id, user_id, name, slug)
        VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Org', 'org');
      INSERT INTO files (key, bucket, original_name, mime_type, size_bytes, uploaded_by, organization_id, entity_type)
      SELECT v.key, 'b', 'a.txt', 'text/plain', 1,
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', v.entity_type
      FROM (VALUES ('todo', 'todo'), ('general', 'general'), ('note', 'note'), ('none', NULL)) AS v(key, entity_type);
    `);

    await applyMigration(client, ENUM_MIGRATION);

    const { rows } = await client.query<{ key: string; entity_type: string | null }>(
      "SELECT key, entity_type FROM files ORDER BY key"
    );
    expect(rows).toEqual([
      { key: "general", entity_type: "general" },
      { key: "none", entity_type: null },
      { key: "note", entity_type: "general" },
      { key: "todo", entity_type: "todo" }
    ]);
    await expect(
      client.query("UPDATE files SET entity_type = 'note' WHERE key = 'todo'")
    ).rejects.toThrow(/invalid input value for enum attachment_entity_type/);
    // Applies every migration on PGlite, which takes over 10 s on a loaded CI runner.
  }, 30_000);
});
