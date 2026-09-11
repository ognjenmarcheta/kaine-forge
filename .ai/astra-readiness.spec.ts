import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  generatedTextEqual,
  readPermissionsSource,
  writeGenerated,
  type WriteResult
} from "./ai.util";
import { matchGuardedCommand } from "./hooks/guarded-command.mjs";

describe("generated text across Windows and Unix checkouts", () => {
  it("ignores only CRLF differences, preserving meaningful drift", () => {
    expect(generatedTextEqual("rule\r\nnext\r\n", "rule\nnext\n")).toBe(true);
    expect(generatedTextEqual("rule\r\nchanged\r\n", "rule\nnext\n")).toBe(false);
    expect(generatedTextEqual("rule \n", "rule\n")).toBe(false);
    expect(generatedTextEqual("rule", "rule\n")).toBe(false);
  });

  it("leaves equivalent installed files untouched but updates changed instructions", () => {
    const dir = mkdtempSync(join(tmpdir(), "kaine-generated-"));
    try {
      const file = join(dir, "AGENTS.md");
      writeFileSync(file, "existing rule\r\n");
      const results: WriteResult[] = [];
      writeGenerated(file, "existing rule\n", results);
      expect(results[0]?.status).toBe("unchanged");
      expect(readFileSync(file, "utf8")).toBe("existing rule\r\n");
      writeGenerated(file, "new rule\n", results);
      expect(results[1]?.status).toBe("updated");
      expect(readFileSync(file, "utf8")).toBe("new rule\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("local setup and agent command policy", () => {
  it("routes local setup through validation while preserving unrestricted push and release denies", () => {
    const manifest: { scripts: Record<string, string> } = JSON.parse(
      readFileSync("package.json", "utf8")
    );
    expect(manifest.scripts["bootstrap"]).toContain("pnpm run db:prepare:local");
    expect(manifest.scripts["test:e2e"]).toContain("pnpm run db:prepare:local");
    for (const script of ["bootstrap", "test:e2e"]) {
      expect(manifest.scripts[script]).not.toMatch(/pnpm run db:(push|seed|ensure)(?:\s|$)/);
    }
    const rules = readPermissionsSource();
    for (const command of ["pnpm db:push:local", "pnpm db:prepare:local"]) {
      expect(matchGuardedCommand(command, rules)).toBeNull();
    }
    for (const command of ["pnpm db:push", "pnpm release:apps", "pnpm release:apps --dry-run"]) {
      expect(matchGuardedCommand(command, rules)?.decision).toBe("deny");
    }
    expect(readFileSync(".ai/skills/kaine-create-feature.md", "utf8")).not.toMatch(
      /`pnpm db:push`/
    );
    expect(readFileSync(".ai/skills/kaine-release-apps.md", "utf8")).toContain("human operator");
  });
});
