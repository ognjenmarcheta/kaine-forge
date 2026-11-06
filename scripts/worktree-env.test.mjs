import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { rewriteWorktreeEnv, runWorktreeEnv } from "./worktree-env.mjs";

const mainEnv = `BETTER_AUTH_URL=http://localhost:4000
WEB_APP_URL=http://localhost:3000
API_PORT=4000
API_URL=http://localhost:4000
API_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
VITE_API_PROXY_TARGET=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
EXPO_PUBLIC_API_URL=https://api.example.com
`;

test("moves every loopback dev-server URL to the worktree ports and keeps other hosts", () => {
  const next = rewriteWorktreeEnv(mainEnv, { web: 13001, api: 14002 });
  assert.equal(
    next,
    `BETTER_AUTH_URL=http://localhost:14002
WEB_APP_URL=http://localhost:13001
API_PORT=14002
API_URL=http://localhost:14002
API_CORS_ORIGINS=http://localhost:13001,http://127.0.0.1:13001
VITE_API_PROXY_TARGET=http://localhost:14002
VITE_GRAPHQL_URL=http://localhost:14002/graphql
EXPO_PUBLIC_API_URL=https://api.example.com
WEB_PORT=13001
`
  );
});

test("a second run with the same ports changes nothing, and new ports follow the old ones", () => {
  const once = rewriteWorktreeEnv(mainEnv, { web: 13001, api: 14002 });
  assert.equal(rewriteWorktreeEnv(once, { web: 13001, api: 14002 }), once);
  assert.equal(rewriteWorktreeEnv(once, { web: 3000, api: 4000 }), `${mainEnv}WEB_PORT=3000\n`);
});

const root = mkdtempSync(join(tmpdir(), "worktree-env-"));
after(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

test("rewrites a linked worktree's .env but refuses the primary checkout", () => {
  const primary = join(root, "primary");
  const linked = join(root, "linked");
  execFileSync("git", ["init", "-q", primary]);
  git(
    primary,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init"
  );
  git(primary, "worktree", "add", "-q", linked);
  writeFileSync(join(primary, ".env"), mainEnv);
  writeFileSync(join(linked, ".env"), mainEnv);

  assert.throws(
    () => runWorktreeEnv(["--web", "13001", "--api", "14002"], primary),
    /primary checkout/
  );
  assert.equal(readFileSync(join(primary, ".env"), "utf8"), mainEnv);

  runWorktreeEnv(["--web", "13001", "--api", "14002"], linked);
  assert.match(readFileSync(join(linked, ".env"), "utf8"), /^API_PORT=14002$/m);
});
