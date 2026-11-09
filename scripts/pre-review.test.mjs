import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { after, test } from "node:test";

import { REPO_ROOT } from "./docs-for.mjs";
import {
  applicableItems,
  changeClasses,
  ciPathFilters,
  classify,
  findings,
  preReview
} from "./pre-review.mjs";

const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/ci-pr.yml"), "utf8");
const filters = ciPathFilters(workflow);
const classes = changeClasses(filters);
const items = (paths) =>
  applicableItems(paths.flatMap((file) => classify(file, classes))).map(({ item }) => item);

const MIGRATION_ITEM =
  "Shipped migrations are not rewritten; schema changes are new migrations in load-bearing order.";
const TOKEN_ITEM =
  "Token-only styling through the theme utilities; no raw colors or arbitrary [var(--ds-*)].";
const GENERATE_ITEM =
  "Operations edited at source and pnpm generate run; generated outputs not hand-edited.";

test("a docs-only change gets the always-apply items and the domain-language item only", () => {
  assert.deepEqual(items(["docs/troubleshooting.md"]), [
    "One primary intent; supporting deltas only; split tagalongs into their own change.",
    "Behavior matches the request; every changed line traces to it.",
    "No secrets, tokens, or .ai.local/ material committed.",
    "Public names use CONTEXT.md terms and avoid its listed synonyms.",
    "No AI self-attribution in commits or the PR body."
  ]);
});

test("checklist items follow the change class of each file", () => {
  const rows = [
    ["packages/db/drizzle/0026_new_table.sql", [MIGRATION_ITEM], [TOKEN_ITEM]],
    [
      "apps/web/src/features/todos/todos.page.tsx",
      [TOKEN_ITEM, "User-facing strings live in translation JSON behind i18n helpers."],
      [MIGRATION_ITEM]
    ],
    ["apps/api/src/features/notes/notes.schema.ts", [GENERATE_ITEM], [TOKEN_ITEM]],
    ["apps/web/src/graphql/generated/graphql.ts", [GENERATE_ITEM], [MIGRATION_ITEM]]
  ];
  for (const [file, included, excluded] of rows) {
    const applied = items([file]);
    for (const item of included) assert.ok(applied.includes(item), `${file} needs: ${item}`);
    for (const item of excluded)
      assert.ok(!applied.includes(item), `${file} must not get: ${item}`);
  }
});

const change = (path, status = "M", added = 1, deleted = 0) => ({ path, status, added, deleted });
const rulesOf = (changes) =>
  findings(changes, filters).map(({ rule, path }) => (path ? `${rule} ${path}` : rule));

test("a releasable change needs a changeset, as the Changeset Required job decides", () => {
  assert.deepEqual(rulesOf([change("packages/ui/src/button.tsx")]), ["changeset-missing"]);
  assert.deepEqual(
    rulesOf([change("packages/ui/src/button.tsx"), change(".changeset/brave-owl.md", "A")]),
    []
  );
  assert.deepEqual(rulesOf([change("docs/troubleshooting.md"), change("scripts/doctor.mjs")]), []);
});

test("the size limit counts authored lines and skips lockfiles and generated files", () => {
  assert.deepEqual(
    rulesOf([change("scripts/a.mjs", "A", 500), change("scripts/b.mjs", "M", 0, 301)]),
    ["diff-too-large"]
  );
  assert.deepEqual(rulesOf([change("scripts/a.mjs", "A", 800)]), []);
  assert.deepEqual(
    rulesOf([
      change("pnpm-lock.yaml", "M", 5000, 4000),
      change("apps/web/src/graphql/generated/graphql.ts", "M", 3000),
      change(".changeset/brave-owl.md", "A")
    ]),
    []
  );
});

test("a generated GraphQL file changed without any of its sources is a hand edit", () => {
  const generated = change("apps/web/src/graphql/generated/graphql.ts");
  const changeset = change(".changeset/brave-owl.md", "A");
  assert.deepEqual(rulesOf([generated, changeset]), [
    "generated-graphql-edited apps/web/src/graphql/generated/graphql.ts"
  ]);
  assert.deepEqual(
    rulesOf([generated, changeset, change("apps/web/src/graphql/operations/todos.graphql")]),
    []
  );
});

test("an already-shipped migration may not be edited or deleted; new ones and the journal may change", () => {
  const changeset = change(".changeset/brave-owl.md", "A");
  assert.deepEqual(
    rulesOf([
      changeset,
      change("packages/db/drizzle/0003_jittery_juggernaut.sql", "M"),
      change("packages/db/drizzle/meta/0004_snapshot.json", "D")
    ]),
    [
      "migration-edited packages/db/drizzle/0003_jittery_juggernaut.sql",
      "migration-edited packages/db/drizzle/meta/0004_snapshot.json"
    ]
  );
  assert.deepEqual(
    rulesOf([
      changeset,
      change("packages/db/drizzle/0026_new_table.sql", "A"),
      change("packages/db/drizzle/meta/0026_snapshot.json", "A"),
      change("packages/db/drizzle/meta/_journal.json", "M")
    ]),
    []
  );
});

const root = mkdtempSync(join(tmpdir(), "pre-review-"));
after(() => rmSync(root, { recursive: true, force: true }));

function write(file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

test("preReview reports a shipped migration edit at its first changed line and sees untracked files", () => {
  const run = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  run("init", "-q", "-b", "main");
  write(".github/workflows/ci-pr.yml", workflow);
  write(
    "docs/adr/0001-db.md",
    "# ADR 0001: Db\n\n- Status: Accepted\n- Applies to: `packages/db/**`\n"
  );
  write("packages/db/drizzle/0001_init.sql", "a;\nb;\nc;\nd;\n");
  run("add", ".");
  run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
  run("switch", "-q", "-c", "work");
  write("packages/db/drizzle/0001_init.sql", "a;\nb;\nC;\nd;\n");
  write(".changeset/brave-owl.md", "---\n---\n");

  const report = preReview({ base: "main", root });
  assert.deepEqual(
    report.findings.map(({ rule, path, line }) => ({ rule, path, line })),
    [{ rule: "migration-edited", path: "packages/db/drizzle/0001_init.sql", line: 3 }]
  );
  assert.ok(report.checklist.some(({ item }) => item === MIGRATION_ITEM));
  assert.equal(
    report.docs.files.find((file) => file.path.endsWith(".sql")).governing[0].doc,
    "docs/adr/0001-db.md"
  );
});

test("the CLI exits 0 with a report and exits 1 only when git cannot resolve the base", () => {
  const cli = (...args) =>
    spawnSync(process.execPath, ["scripts/pre-review.mjs", ...args], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    });
  const ok = cli("--json", "--base", "HEAD");
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).checklist[0].section, "Scope");
  assert.equal(cli("--base", "no-such-ref-for-pre-review").status, 1);
});
