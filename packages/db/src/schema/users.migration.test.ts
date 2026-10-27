import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const migrationsFolder = path.join(import.meta.dirname, "../../drizzle");

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
  const entries: unknown[] = journal.entries;
  return entries.map((entry) => {
    if (typeof entry !== "object" || entry === null || !("tag" in entry)) {
      throw new Error("unexpected drizzle journal entry");
    }
    if (typeof entry.tag !== "string") {
      throw new Error("unexpected drizzle journal tag");
    }
    return entry.tag;
  });
}

async function readMigration(tag: string): Promise<string> {
  return readFile(path.join(migrationsFolder, `${tag}.sql`), "utf8");
}

describe("onboarding migration", () => {
  const client = new PGlite();

  afterAll(async () => {
    await client.close();
  });

  it("marks existing users as onboarded and leaves later sign-ups to onboarding", async () => {
    const tags = await readJournalTags();
    const migrations = await Promise.all(tags.map(readMigration));
    // Found by content: the tag changes when main gains a migration first.
    const onboardingIndex = migrations.findIndex((sql) =>
      sql.includes('ADD COLUMN "onboarding_completed_at"')
    );
    expect(onboardingIndex).toBeGreaterThan(0);

    for (const sql of migrations.slice(0, onboardingIndex)) {
      await client.exec(sql);
    }
    await client.exec(`INSERT INTO users (email, name) VALUES ('seed@example.test', 'Seed')`);

    for (const sql of migrations.slice(onboardingIndex)) {
      await client.exec(sql);
    }
    await client.exec(`INSERT INTO users (email, name) VALUES ('new@example.test', 'New')`);

    const { rows } = await client.query<{ email: string; onboarded: boolean }>(
      "SELECT email, onboarding_completed_at IS NOT NULL AS onboarded FROM users ORDER BY email"
    );
    expect(rows).toEqual([
      { email: "new@example.test", onboarded: false },
      { email: "seed@example.test", onboarded: true }
    ]);
    // Applies every migration on PGlite, which takes over 10 s on a loaded CI runner.
  }, 30_000);
});
