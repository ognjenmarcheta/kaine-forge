import { describe, expect, it } from "vitest";

import { failureLines, fingerprintFailure, normalizeLine } from "./check.fingerprint";

const ARGV = ["pnpm", "check:affected"];

describe("normalizeLine", () => {
  it("removes the parts that change between rounds", () => {
    expect(normalizeLine("\u001b[31mError\u001b[0m at 2026-10-07T12:30:45.123Z took 1.25s")).toBe(
      "Error at <time> took <dur>"
    );
    expect(normalizeLine("[12:30:45] done in 340ms")).toBe("[<time>] done in <dur>");
    expect(normalizeLine("cache miss, executing 4f3a9c0d1e2b7788")).toBe(
      "cache miss, executing <id>"
    );
    expect(normalizeLine("run 123e4567-e89b-12d3-a456-426614174000 failed")).toBe(
      "run <id> failed"
    );
  });

  it("blanks the roots and other absolute paths but keeps the file name", () => {
    expect(normalizeLine("/work/wt/packages/a/src/x.ts:41:7 error TS2322", ["/work/wt"])).toBe(
      "<dir>/packages/a/src/x.ts:<n> error TS2322"
    );
    expect(normalizeLine("open /var/folders/zz/T/desk-abc123/out.log failed")).toBe(
      "open <abs>/out.log failed"
    );
  });

  it("leaves relative paths and URLs alone", () => {
    expect(normalizeLine("see https://example.test/a/b and packages/a/src/x.ts")).toBe(
      "see https://example.test/a/b and packages/a/src/x.ts"
    );
  });
});

describe("failureLines", () => {
  it("keeps the failure lines and drops banners", () => {
    const output = ["turbo 2.5.0", "• Packages in scope: a, b", "ERROR: boom", "ok line"].join(
      "\n"
    );
    expect(failureLines(output)).toEqual(["ERROR: boom"]);
  });

  it("falls back to the last lines when nothing looks like a failure", () => {
    expect(failureLines(["one", "two", "three"].join("\n"))).toEqual(["one", "two", "three"]);
  });

  it("caps the number of lines", () => {
    const output = Array.from({ length: 100 }, (_, index) => `error number ${index}`).join("\n");
    expect(failureLines(output)).toHaveLength(20);
  });
});

describe("fingerprintFailure", () => {
  it("is the same for the same failure with different noise", () => {
    const first = [
      "[10:00:01] starting",
      "FAIL src/a.test.ts > adds > returns 3 (12ms)",
      "AssertionError: expected 2 to be 3",
      " ❯ /tmp/run-aaaa/wt/src/a.test.ts:10:5"
    ].join("\n");
    const second = [
      "[11:42:59] starting",
      "FAIL src/a.test.ts > adds > returns 3 (480ms)",
      "AssertionError: expected 2 to be 3",
      " ❯ /private/tmp/run-bbbb/wt/src/a.test.ts:14:5"
    ].join("\n");
    expect(fingerprintFailure({ argv: ARGV, output: first })).toBe(
      fingerprintFailure({ argv: ARGV, output: second })
    );
  });

  it("differs for a different failure message", () => {
    const a = fingerprintFailure({ argv: ARGV, output: "AssertionError: expected 2 to be 3" });
    const b = fingerprintFailure({ argv: ARGV, output: "AssertionError: expected 2 to be 4" });
    expect(a).not.toBe(b);
  });

  it("differs for a different failing command", () => {
    const output = "error TS2322: bad type";
    expect(fingerprintFailure({ argv: ["pnpm", "check"], output })).not.toBe(
      fingerprintFailure({ argv: ["pnpm", "lint"], output })
    );
  });

  it("uses a fixed marker for a timeout, whatever the output was", () => {
    expect(fingerprintFailure({ argv: ARGV, output: "a", timedOut: true })).toBe(
      fingerprintFailure({ argv: ARGV, output: "zzz error", timedOut: true })
    );
  });

  it("returns a sha256 hex string", () => {
    expect(fingerprintFailure({ argv: ARGV, output: "error" })).toMatch(/^[0-9a-f]{64}$/);
  });
});
