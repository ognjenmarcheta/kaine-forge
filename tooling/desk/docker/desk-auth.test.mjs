import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { claudeLoginChanged, seedCredentials, syncBack, validCredentials } from "./desk-auth.mjs";

const claudeJson = (token) => JSON.stringify({ claudeAiOauth: { accessToken: token } });
const scratch = () => mkdtempSync(path.join(tmpdir(), "desk-auth-"));

test("validCredentials accepts the shape of each provider and nothing else", () => {
  assert.equal(validCredentials("claude", claudeJson("t")), true);
  assert.equal(validCredentials("claude", claudeJson("")), false);
  assert.equal(validCredentials("claude", "not json"), false);
  assert.equal(validCredentials("claude", "{}"), false);
  assert.equal(validCredentials("codex", '{"auth_mode":"chatgpt"}'), true);
  assert.equal(validCredentials("codex", "[]"), false);
  assert.equal(validCredentials("other", "{}"), false);
});

test("claudeLoginChanged sees a new valid token and ignores partial writes", () => {
  const dir = scratch();
  try {
    const file = path.join(dir, ".credentials.json");
    assert.equal(claudeLoginChanged(file, ""), false);
    writeFileSync(file, claudeJson("a"));
    assert.equal(claudeLoginChanged(file, ""), true);
    assert.equal(claudeLoginChanged(file, claudeJson("a")), false);
    writeFileSync(file, '{"claudeAiOauth":');
    assert.equal(claudeLoginChanged(file, ""), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seedCredentials copies the provider files that exist", () => {
  const from = scratch();
  const to = path.join(scratch(), "run");
  try {
    writeFileSync(path.join(from, ".credentials.json"), claudeJson("a"));
    writeFileSync(path.join(from, "unrelated.txt"), "x");
    assert.deepEqual(seedCredentials("claude", from, to), [".credentials.json"]);
    assert.equal(readFileSync(path.join(to, ".credentials.json"), "utf8"), claudeJson("a"));
    assert.deepEqual(seedCredentials("codex", from, to), []);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(path.dirname(to), { recursive: true, force: true });
  }
});

test("syncBack copies a newer valid token and rejects garbage or an older file", () => {
  const run = scratch();
  const auth = scratch();
  try {
    const stored = path.join(auth, ".credentials.json");
    const fresh = path.join(run, ".credentials.json");
    writeFileSync(stored, claudeJson("old"));
    utimesSync(stored, 1000, 1000);
    writeFileSync(fresh, claudeJson("new"));
    assert.deepEqual(syncBack("claude", run, auth), [".credentials.json"]);
    assert.equal(readFileSync(stored, "utf8"), claudeJson("new"));
    // Garbage from a hostile run does not replace the login.
    writeFileSync(fresh, "garbage");
    assert.deepEqual(syncBack("claude", run, auth), []);
    assert.equal(readFileSync(stored, "utf8"), claudeJson("new"));
    // An older valid file does not replace a newer login.
    writeFileSync(fresh, claudeJson("older"));
    utimesSync(fresh, 500, 500);
    assert.deepEqual(syncBack("claude", run, auth), []);
    mkdirSync(path.join(run, "sub"), { recursive: true });
  } finally {
    rmSync(run, { recursive: true, force: true });
    rmSync(auth, { recursive: true, force: true });
  }
});
