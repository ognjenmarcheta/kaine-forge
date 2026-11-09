import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { after, test } from "node:test";

import {
  GUIDE_TABLE,
  REPO_ROOT,
  collectChanges,
  loadAdrs,
  matchGlob,
  resolveDocs
} from "./docs-for.mjs";

const root = mkdtempSync(join(tmpdir(), "docs-for-"));
after(() => rmSync(root, { recursive: true, force: true }));

function write(base, file, text) {
  mkdirSync(dirname(join(base, file)), { recursive: true });
  writeFileSync(join(base, file), text);
}

const adrRoot = join(root, "adrs");
write(
  adrRoot,
  "docs/adr/0001-auth-provider.md",
  "# ADR 0001: Auth provider\n\n- Status: Accepted\n- Date: 2026-01-01\n- Applies to: `packages/auth/**`\n"
);
write(
  adrRoot,
  "docs/adr/0002-old-billing.md",
  "# ADR 0002: Old billing\n\n- Status: Superseded by [ADR 0004](0004-new-billing.md).\n- Date: 2026-01-01\n- Applies to: `packages/billing/**`\n"
);
write(
  adrRoot,
  "docs/adr/0003-sync-proposal.md",
  "# ADR 0003: Sync proposal\n\n- Status: Proposed\n- Date: 2026-01-01\n- Applies to: `packages/sync/**`, `apps/api/src/features/sync/**`\n"
);
write(
  adrRoot,
  "docs/adr/0004-new-billing.md",
  "# ADR 0004: New billing for packages/auth\n\n- Status: Accepted\n- Date: 2026-01-02\n- Applies to: `packages/billing/src/**`\n"
);
write(
  adrRoot,
  "docs/adr/0005-packages-db-conventions.md",
  "# ADR 0005: packages/db conventions\n\n- Status: Accepted\n- Date: 2026-01-03\n"
);

const docsOf = (file) => file.governing.map((entry) => entry.doc);

test("only an Accepted ADR's declared globs govern; others are context with their replacement", () => {
  const result = resolveDocs(
    ["packages/auth/src/auth.instance.ts", "packages/billing/src/plan.ts", "packages/sync/x.ts"],
    { adrs: loadAdrs(adrRoot), table: [] }
  );
  assert.deepEqual(result.files, [
    {
      path: "packages/auth/src/auth.instance.ts",
      governing: [
        {
          doc: "docs/adr/0001-auth-provider.md",
          title: "ADR 0001: Auth provider",
          status: "Accepted",
          via: "packages/auth/**"
        }
      ],
      context: []
    },
    {
      path: "packages/billing/src/plan.ts",
      governing: [
        {
          doc: "docs/adr/0004-new-billing.md",
          title: "ADR 0004: New billing for packages/auth",
          status: "Accepted",
          via: "packages/billing/src/**"
        }
      ],
      context: [
        {
          doc: "docs/adr/0002-old-billing.md",
          title: "ADR 0002: Old billing",
          status: "Superseded by ADR 0004.",
          replacement: "docs/adr/0004-new-billing.md",
          via: "packages/billing/**"
        }
      ]
    },
    {
      path: "packages/sync/x.ts",
      governing: [],
      context: [
        {
          doc: "docs/adr/0003-sync-proposal.md",
          title: "ADR 0003: Sync proposal",
          status: "Proposed",
          replacement: null,
          via: "packages/sync/**"
        }
      ]
    }
  ]);
  assert.deepEqual(result.ungoverned, ["packages/sync/x.ts"]);
});

test("an ADR without an Applies to line governs nothing, whatever its name or title says", () => {
  const result = resolveDocs(["packages/db/src/schema/users.schema.ts"], {
    adrs: loadAdrs(adrRoot),
    table: []
  });
  assert.deepEqual(result.ungoverned, ["packages/db/src/schema/users.schema.ts"]);
});

test("the guide table adds docs once per doc and section, after the ADRs", () => {
  const table = [
    { globs: ["packages/**"], docs: [{ doc: "GUIDE.md", section: "4. Rules" }] },
    { globs: ["packages/auth/**"], docs: [{ doc: "GUIDE.md", section: "4. Rules" }] },
    { globs: ["packages/auth/**"], docs: [{ doc: "GUIDE.md", section: "6. Auth" }] }
  ];
  const [file] = resolveDocs(["packages/auth/x.ts"], { adrs: loadAdrs(adrRoot), table }).files;
  assert.deepEqual(file.governing.slice(1), [
    { doc: "GUIDE.md", section: "4. Rules", via: "packages/**" },
    { doc: "GUIDE.md", section: "6. Auth", via: "packages/auth/**" }
  ]);
});

test("a directory is governed by globs that reach inside it", () => {
  const { files } = resolveDocs(["packages/billing"], {
    adrs: loadAdrs(adrRoot),
    table: [],
    isDir: (file) => file === "packages/billing"
  });
  assert.deepEqual(docsOf(files[0]), ["docs/adr/0004-new-billing.md"]);
  assert.equal(files[0].context[0].doc, "docs/adr/0002-old-billing.md");
});

test("globs match dot files and dot folders as GitHub path filters do", () => {
  const rows = [
    [".ai/skills/kaine-test.md", ".ai/**", true],
    ["apps/web/.env.example", "apps/**", true],
    [".changeset/brave-owl.md", ".changeset/*.md", true],
    ["Dockerfile.api", "Dockerfile.*", true],
    ["apps/web/src/a.tsx", "apps/api/**", false]
  ];
  for (const [file, glob, expected] of rows) {
    assert.equal(matchGlob(file, glob), expected, `${file} ~ ${glob}`);
  }
});

const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" })
  .trim()
  .split("\n");

test("every declared ADR glob and guide-table glob matches a tracked file", () => {
  const globs = [
    ...loadAdrs().flatMap((adr) => adr.appliesTo.map((glob) => [adr.doc, glob])),
    ...GUIDE_TABLE.flatMap((row) => row.globs.map((glob) => ["GUIDE_TABLE", glob]))
  ];
  const dead = globs.filter(([, glob]) => !tracked.some((file) => matchGlob(file, glob)));
  assert.deepEqual(dead, []);
});

test("every guide-table doc exists and names a real heading", () => {
  const broken = [];
  for (const { doc, section } of GUIDE_TABLE.flatMap((row) => row.docs)) {
    let text = "";
    try {
      text = readFileSync(join(REPO_ROOT, doc), "utf8");
    } catch {
      broken.push(doc);
      continue;
    }
    const headings = text.split("\n").filter((line) => /^#{1,6} /.test(line));
    if (section && !headings.some((line) => line.replace(/^#+ /, "") === section)) {
      broken.push(`${doc} § ${section}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("the CLI resolves a real path through the repo's ADRs and reports an ungoverned one", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/docs-for.mjs", "packages/auth/src/index.ts", "LICENSE", "--json"],
    { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, INIT_CWD: REPO_ROOT } }
  );
  const result = JSON.parse(output);
  assert.ok(docsOf(result.files[0]).includes("docs/adr/0008-adopt-better-auth.md"));
  assert.deepEqual(result.ungoverned, ["LICENSE"]);
});

test("collectChanges lists commits, working-tree edits, deletions, and untracked files since the merge base", () => {
  const repo = join(root, "repo");
  const run = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  mkdirSync(repo);
  run("init", "-q", "-b", "main");
  write(repo, "kept.txt", "one\ntwo\n");
  write(repo, "gone.txt", "bye\n");
  run("add", ".");
  run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
  run("switch", "-q", "-c", "work");
  write(repo, "committed.txt", "a\nb\nc\n");
  run("add", ".");
  run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "work");
  write(repo, "kept.txt", "one\nTWO\n");
  unlinkSync(join(repo, "gone.txt"));
  write(repo, "new/untracked.txt", "x\ny\n");

  const { changes } = collectChanges("main", repo);
  assert.deepEqual(changes, [
    { path: "committed.txt", status: "A", added: 3, deleted: 0 },
    { path: "gone.txt", status: "D", added: 0, deleted: 1 },
    { path: "kept.txt", status: "M", added: 1, deleted: 1 },
    { path: "new/untracked.txt", status: "A", added: 2, deleted: 0, untracked: true }
  ]);
});
