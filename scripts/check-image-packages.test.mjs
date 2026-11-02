import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { findMissingPackages } from "./check-image-packages.mjs";

/** Writes a package.json, and the entry file when `built` is true. */
function writePackage(dir, manifest, built) {
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  if (built) writeFileSync(join(dir, "dist", "index.js"), "export {};\n");
}

const exportsField = { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } };

describe("findMissingPackages", () => {
  const root = mkdtempSync(join(tmpdir(), "image-packages-"));
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const app = join(root, "apps", "api");
  writePackage(
    app,
    {
      name: "@repo/api",
      dependencies: { "@repo/db": "workspace:*", "@repo/theme": "workspace:*", zod: "4" }
    },
    false
  );
  const db = join(app, "node_modules", "@repo", "db");
  writePackage(
    db,
    { name: "@repo/db", exports: exportsField, dependencies: { "@repo/logger": "workspace:*" } },
    true
  );
  writePackage(
    join(app, "node_modules", "@repo", "theme"),
    { name: "@repo/theme", exports: exportsField },
    false
  );
  writePackage(
    join(db, "node_modules", "@repo", "logger"),
    { name: "@repo/logger", exports: exportsField },
    false
  );

  it("names every workspace package, direct or transitive, whose built entry is not in the image", () => {
    assert.deepEqual(findMissingPackages(app), [
      "@repo/logger (./dist/index.js)",
      "@repo/theme (./dist/index.js)"
    ]);
  });
});
