import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const migrationsFolder = path.join(import.meta.dirname, "../../drizzle");
const PERSONAL_MIGRATION = "0013_great_landau";
const USER_ID = "abcdef12-0000-4000-8000-000000000001";

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

describe("personal organization migration", () => {
  const client = new PGlite();

  afterAll(async () => {
    await client.close();
  });

  it("marks only personal organizations and queues storage purges for deleted ones", async () => {
    const tags = await readJournalTags();
    const personalIndex = tags.indexOf(PERSONAL_MIGRATION);
    expect(personalIndex).toBeGreaterThan(0);

    for (const tag of tags.slice(0, personalIndex)) {
      await applyMigration(client, tag);
    }

    // The original personal slug, a replacement after #694, and two
    // user-created organizations that only look alike.
    await client.exec(`
      INSERT INTO users (id, email, name) VALUES ('${USER_ID}', 'm@example.test', 'M');
      INSERT INTO organizations (user_id, name, slug, logo) VALUES
        ('${USER_ID}', 'Personal', 'personal-abcdef12', NULL),
        ('${USER_ID}', 'Personal', 'personal-0b9c3a3e-5f1d-4c39-9a51-2f8d5c4e7a10', NULL),
        ('${USER_ID}', 'Personal', 'personal-2', NULL),
        ('${USER_ID}', 'Acme', 'acme', 'https://cdn.example.test/organization-logos/a.webp');
    `);

    await applyMigration(client, PERSONAL_MIGRATION);

    const { rows } = await client.query<{ slug: string; personal: boolean }>(
      "SELECT slug, personal FROM organizations ORDER BY slug"
    );
    expect(rows).toEqual([
      { slug: "acme", personal: false },
      { slug: "personal-0b9c3a3e-5f1d-4c39-9a51-2f8d5c4e7a10", personal: true },
      { slug: "personal-2", personal: false },
      { slug: "personal-abcdef12", personal: true }
    ]);

    // Deleting the user cascades to every organization it owns.
    await client.exec(`DELETE FROM users WHERE id = '${USER_ID}'`);
    const purges = await client.query<{ logo: string | null }>(
      "SELECT logo FROM organization_storage_purges ORDER BY logo NULLS LAST"
    );
    expect(purges.rows).toEqual([
      { logo: "https://cdn.example.test/organization-logos/a.webp" },
      { logo: null },
      { logo: null },
      { logo: null }
    ]);
    // Applies every migration on PGlite, which takes over 10 s on a loaded CI runner.
  }, 30_000);
});
