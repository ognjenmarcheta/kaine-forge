import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, after } from "node:test";

import { fixEsmExtensionsInSource, fixEsmExtensionsInDirs } from "./fix-esm-extensions.mjs";

describe("fixEsmExtensionsInSource", () => {
  const root = mkdtempSync(join(tmpdir(), "fix-esm-"));
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Targets that resolveSpecifier must find on disk.
  writeFileSync(join(root, "api.runtime.js"), "export const startApiRuntime = () => {};\n");
  writeFileSync(join(root, "server.js"), "export const createApiServer = () => {};\n");
  writeFileSync(join(root, "env.config.js"), "export const validateApiEnv = () => ({});\n");
  writeFileSync(join(root, "data.json"), "{}\n");

  it("adds .js to dynamic relative imports (the production API boot path)", () => {
    const source = `
const { startApiRuntime } = await import("./api.runtime");
const { createApiServer } = await import("./server");
const packageImport = await import("@repo/db/client");
`;
    const warnings = [];
    const { fixed, warnings: count } = fixEsmExtensionsInSource(source, root, {
      warn: (message) => warnings.push(message)
    });

    assert.equal(count, 0);
    assert.match(fixed, /await import\("\.\/api\.runtime\.js"\)/);
    assert.match(fixed, /await import\("\.\/server\.js"\)/);
    // Package imports stay extensionless (Node package exports resolve them).
    assert.match(fixed, /await import\("@repo\/db\/client"\)/);
    assert.equal(warnings.length, 0);
  });

  it("adds .js to static relative from/import", () => {
    const source = `import { validateApiEnv } from "./env.config";\nexport { x } from "./server";\n`;
    const { fixed, warnings } = fixEsmExtensionsInSource(source, root, {
      warn: () => {}
    });
    assert.equal(warnings, 0);
    assert.match(fixed, /from "\.\/env\.config\.js"/);
    assert.match(fixed, /from "\.\/server\.js"/);
  });

  it("leaves already-suffixed relative imports alone", () => {
    const source = `await import("./api.runtime.js");\n`;
    const { fixed, warnings } = fixEsmExtensionsInSource(source, root, {
      warn: () => {}
    });
    assert.equal(warnings, 0);
    assert.equal(fixed, source);
  });

  it("counts unresolvable relative dynamic imports as warnings", () => {
    const source = `await import("./missing-module");\n`;
    const { fixed, warnings } = fixEsmExtensionsInSource(source, root, {
      warn: () => {}
    });
    assert.equal(warnings, 1);
    assert.match(fixed, /await import\("\.\/missing-module"\)/);
  });
});

describe("fixEsmExtensionsInDirs", () => {
  it("rewrites files on disk for both static and dynamic forms", () => {
    const root = mkdtempSync(join(tmpdir(), "fix-esm-dirs-"));
    try {
      writeFileSync(join(root, "dep.js"), "export const dep = 1;\n");
      writeFileSync(
        join(root, "index.js"),
        `import { dep } from "./dep";\nconst x = await import("./dep");\n`
      );

      const result = fixEsmExtensionsInDirs([root], {
        log: () => {},
        error: () => {}
      });
      assert.equal(result.ok, true);

      const rewritten = readFileSync(join(root, "index.js"), "utf8");
      assert.match(rewritten, /from "\.\/dep\.js"/);
      assert.match(rewritten, /await import\("\.\/dep\.js"\)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
