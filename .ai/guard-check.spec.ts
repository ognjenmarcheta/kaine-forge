import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as ai from "./ai.util";
import { checkGuardContracts } from "./guard-check.util";

afterEach(() => vi.restoreAllMocks());

describe("guard contract self-check", () => {
  it("executes all hook dialects and the generated OpenCode handler", () => {
    expect(checkGuardContracts()).toEqual([]);
  });

  it("rejects a wrong Cursor config and an OpenCode callback that silently allows deletion", () => {
    vi.spyOn(ai, "renderCursorHooks").mockReturnValue('{"hooks":[]}');
    vi.spyOn(ai, "renderOpencodeGuardrailPlugin").mockReturnValue(
      'export const KaineGuardrail = async () => ({ "tool.execute.before": async () => {} });'
    );
    const errors = checkGuardContracts();
    expect(errors).toEqual([
      expect.stringContaining("cursor configuration"),
      expect.stringContaining("opencode plugin")
    ]);
  });

  it("detects a wrong deny payload even when the hook keeps its blocking exit code", () => {
    const root = mkdtempSync(join(tmpdir(), "kaine-guard-payload-"));
    try {
      mkdirSync(join(root, ".ai/hooks"), { recursive: true });
      for (const file of [
        "permissions.json",
        "hooks/guarded-command.mjs",
        "hooks/pre-tool-use.mjs"
      ]) {
        const source = readFileSync(join(ai.REPO_ROOT, ".ai", file), "utf8");
        writeFileSync(
          join(root, ".ai", file),
          source.replace('permissionDecision: "deny"', 'permissionDecision: "allow"')
        );
      }
      expect(checkGuardContracts(root)).toEqual([
        expect.stringContaining("claude pnpm db:push"),
        expect.stringContaining("codex pnpm db:push")
      ]);
    } finally {
      expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("OpenCode generated plugin migration", () => {
  it.each(["\n", "\r\n"])("removes only the generated legacy file (%j line endings)", (newline) => {
    const root = mkdtempSync(join(tmpdir(), "kaine-guard-migration-"));
    const directory = join(root, ".opencode/plugin");
    const legacy = join(directory, "kaine-guardrail.ts");
    const personal = join(directory, "personal.ts");
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(personal, "personal plugin");
      writeFileSync(legacy, "handwritten plugin");
      expect(ai.removeLegacyOpencodeGuardrail(root)).toBe(false);
      expect(existsSync(legacy)).toBe(true);
      writeFileSync(legacy, `// ${ai.GEN_NOTICE}${newline}old plugin`);
      expect(ai.removeLegacyOpencodeGuardrail(root)).toBe(true);
      expect(existsSync(legacy)).toBe(false);
      expect(existsSync(personal)).toBe(true);
      expect(ai.removeLegacyOpencodeGuardrail(root)).toBe(false);
    } finally {
      expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
      rmSync(root, { recursive: true, force: true });
    }
  });
});
