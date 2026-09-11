import assert from "node:assert/strict";
import { test } from "node:test";

import { runLocalDatabase, validateLocalDatabase } from "./db-local.util.mjs";

const localEnv = {
  ALLOW_LOCAL_DB_PUSH: "true",
  DATABASE_URL: "postgresql://user:secret@localhost:5432/kaine_test"
};

test("allows explicitly opted-in local PostgreSQL targets", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const env = { ...localEnv, DATABASE_URL: `postgres://user:secret@${host}:5544/kaine_test` };
    assert.equal(validateLocalDatabase(env), env.DATABASE_URL);
  }
});

test("rejects unsafe targets before any database operation and does not expose credentials", () => {
  const rejected = [
    { ...localEnv, ALLOW_LOCAL_DB_PUSH: undefined },
    { ...localEnv, ALLOW_LOCAL_DB_PUSH: "false" },
    { ...localEnv, NODE_ENV: "production" },
    ...[
      "https://localhost/db",
      "postgres://remote/db",
      "postgres://localhost.evil/db",
      "postgres://localhost/",
      "postgres://localhost/postgres",
      "postgres://localhost/template0",
      "postgres://localhost/TEMPLATE1",
      "postgres://localhost/db?host=remote",
      "postgres://localhost/db?",
      "postgres://localhost/db#fragment",
      "postgres://localhost/db%2Fevil",
      "postgres://localhost/%00",
      "postgres://localhost:0/db",
      "postgres://localhost:99999/db",
      "not a URL",
      "postgres://localhost@remote/db",
      "postgres://user:secret@remote/db"
    ].map((DATABASE_URL) => ({ ...localEnv, DATABASE_URL }))
  ];
  for (const env of rejected) {
    let calls = 0;
    assert.throws(
      () =>
        runLocalDatabase(["prepare"], env, () => {
          calls++;
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("secret"));
        return true;
      }
    );
    assert.equal(calls, 0);
  }
});

test("rejects extra arguments before database operations", () => {
  for (const args of [[], ["prepare", "--force"], ["push", "--config", "remote.ts"], ["other"]]) {
    assert.throws(
      () => runLocalDatabase(args, localEnv, () => assert.fail("must not run")),
      /without extra arguments/
    );
  }
});

test("prepares in order, forwards the validated URL, and stops on failure", () => {
  const calls = [];
  runLocalDatabase(["prepare"], localEnv, (script, url) => calls.push([script, url]));
  assert.deepEqual(
    calls,
    ["db:ensure", "db:push", "db:seed"].map((script) => [script, localEnv.DATABASE_URL])
  );
  const failedCalls = [];
  assert.throws(
    () =>
      runLocalDatabase(["prepare"], localEnv, (script) => {
        failedCalls.push(script);
        if (script === "db:push") throw new Error("declined destructive prompt");
      }),
    /declined/
  );
  assert.deepEqual(failedCalls, ["db:ensure", "db:push"]);
  const pushCalls = [];
  runLocalDatabase(["push"], localEnv, (script) => pushCalls.push(script));
  assert.deepEqual(pushCalls, ["db:push"]);
});
