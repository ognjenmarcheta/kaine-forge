import * as fs from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { checkGuardContracts } from "./guard-check.util";

vi.mock("./guard-check.util", () => ({ checkGuardContracts: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync)
  };
});

it("makes doctor fail even without --strict when a guard contract fails", async () => {
  const exitCode = process.exitCode;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const { existsSync, readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.spyOn(fs, "existsSync").mockImplementation((path) => {
    if (
      [
        join(REPO_ROOT, ".cursor"),
        join(REPO_ROOT, ".opencode"),
        join(REPO_ROOT, ".opencode/plugins/kaine-guardrail.ts")
      ].includes(String(path))
    )
      return true;
    if (String(path) === join(REPO_ROOT, ".cursor/hooks.json")) return false;
    return existsSync(path);
  });
  vi.spyOn(fs, "readFileSync").mockImplementation((path, options) => {
    if (String(path) === join(REPO_ROOT, ".opencode/plugins/kaine-guardrail.ts"))
      return "stale plugin";
    return readFileSync(path, options);
  });
  vi.mocked(checkGuardContracts).mockReturnValue(["cursor configuration: wrong verdict"]);
  try {
    await import("./doctor");
    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain("cursor configuration: wrong verdict");
    expect(log.mock.calls.flat().join("\n")).toMatch(/\.cursor\/hooks.json\s+missing/);
    expect(log.mock.calls.flat().join("\n")).toMatch(
      /\.opencode\/plugins\/kaine-guardrail.ts\s+stale/
    );
  } finally {
    process.exitCode = exitCode;
    vi.restoreAllMocks();
  }
});
