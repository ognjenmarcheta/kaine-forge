import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";

it("validates the independent CRUD verifier against working APIs and a deliberately unscoped deletion", () => {
  const api = path.join(REPO_ROOT, "apps/api");
  // Outside apps/api, so a killed run leaves nothing for the api lint to find. The control
  // therefore imports api source by absolute path.
  const directory = mkdtempSync(path.join(tmpdir(), "kaine-grader-"));
  const src = `${path.join(api, "src").replaceAll("\\", "/")}/`;
  try {
    // Trusted control only: candidate artifacts must use certified sandbox execution.
    const source = readFileSync(path.join(REPO_ROOT, ".ai/fixtures/crud.verifier.test.txt"), "utf8")
      .replaceAll("__plural__", "notes")
      .replaceAll("__Plural__", "Notes")
      .replaceAll("__Singular__", "Note")
      .replaceAll("__singular__", "note")
      .replaceAll('"./features/', `"${src}features/`)
      .replaceAll('"./context.', `"${src}context.`);
    const target = path.join(directory, "control.test.ts");
    const run = () =>
      spawnSync(
        process.execPath,
        [path.join(api, "node_modules/vitest/vitest.mjs"), "run", "--dir", directory, target],
        {
          cwd: api,
          encoding: "utf8",
          timeout: 60_000,
          env: { ...process.env, DATABASE_URL: "postgresql://synthetic:synthetic@localhost/unused" }
        }
      );
    writeFileSync(target, source);
    const correct = run();
    expect(correct.status, `${correct.stdout}\n${correct.stderr}`).toBe(0);
    const mutation = `
vi.mock("${src}features/notes/notes.adapter", async (importOriginal) => ({
  ...await importOriginal(),
  deleteNote: async (_scope, id) => {
    if (!holder.database) throw new Error("Missing fixture");
    const result = await holder.database.client.query("DELETE FROM notes WHERE id = $1 RETURNING id", [id]);
    return result.rows.length > 0;
  }
}));`;
    writeFileSync(target, source + mutation);
    const incorrect = run();
    expect(incorrect.status).not.toBeNull();
    expect(incorrect.status).not.toBe(0);
    expect(`${incorrect.stdout}\n${incorrect.stderr}`).toContain("expected true to be false");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
