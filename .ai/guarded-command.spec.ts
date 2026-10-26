import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { checkGuardContracts } from "./guard-check.util";
import { matchGuardedCommand, readGuardedCommandPolicy } from "./hooks/guarded-command.mjs";

const valid = {
  id: "db-push",
  decision: "deny",
  command: "pnpm db:push",
  reason: "Use migrations."
};

let root: string;
const policyPath = (): string => join(root, ".ai", "permissions.json");
const writePolicy = (rules: unknown[]): void =>
  writeFileSync(policyPath(), JSON.stringify({ rules }));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kaine-guard-policy-"));
  mkdirSync(join(root, ".ai", "hooks"), { recursive: true });
});

afterEach(() => {
  expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
  rmSync(root, { recursive: true, force: true });
});

describe("readGuardedCommandPolicy", () => {
  it.each([
    ["a null entry", null],
    ["a missing command", { id: "x", decision: "deny", reason: "r" }],
    ["a blank command", { ...valid, command: "  " }],
    ["an unknown decision", { ...valid, decision: "allow" }],
    ["a missing reason", { id: "x", decision: "deny", command: "pnpm x" }],
    ["a non-string id", { ...valid, id: 7 }],
    ["a non-string flag", { ...valid, flag: true }],
    ["a non-string instead", { ...valid, instead: ["pnpm db:push:local"] }]
  ])("drops and reports %s while the valid rule still matches", (_label, malformed) => {
    writePolicy([malformed, valid]);

    const { rules, dropped } = readGuardedCommandPolicy(policyPath());

    expect(dropped).toEqual([0]);
    expect(matchGuardedCommand("pnpm db:push", rules)?.id).toBe("db-push");
  });

  it("throws when the rules array is missing, so each caller picks its own fail-open", () => {
    writeFileSync(policyPath(), JSON.stringify({ deny: [] }));

    expect(() => readGuardedCommandPolicy(policyPath())).toThrow("rules must be an array");
  });
});

it("makes the doctor guard check name each dropped rule", () => {
  for (const file of ["hooks/guarded-command.mjs", "hooks/pre-tool-use.mjs"]) {
    copyFileSync(join(REPO_ROOT, ".ai", file), join(root, ".ai", file));
  }
  const committed: { rules: unknown[] } = JSON.parse(
    readFileSync(join(REPO_ROOT, ".ai", "permissions.json"), "utf8")
  );
  writePolicy([{ id: "broken", decision: "deny", reason: "no command" }, ...committed.rules]);

  expect(checkGuardContracts(root)).toEqual([
    ".ai/permissions.json: rules[0] is malformed, so no agent enforces it"
  ]);
});
