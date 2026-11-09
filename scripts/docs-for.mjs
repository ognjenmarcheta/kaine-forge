import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_BASE = "origin/main";

const guide = (section) => ({ doc: "MONOREPO_GUIDE.md", section });
const UI_DOCS = [
  { doc: "DESIGN_SYSTEM.md" },
  { doc: "docs/ui/guidelines.md" },
  // `pnpm theme:build` copies the default theme's DESIGN.md to the root.
  { doc: "DESIGN.md" }
];

/**
 * Docs that govern a path regardless of ADRs. Keep it short and true: the
 * Required Reading in `.ai/guide.md` and the sections of MONOREPO_GUIDE.md.
 */
export const GUIDE_TABLE = [
  {
    globs: ["apps/**", "packages/**", "tooling/**"],
    docs: [
      guide("4. Feature-Driven File Rules"),
      guide("5. Strings, Types, and Package Boundaries")
    ]
  },
  {
    globs: [
      "apps/web/**",
      "apps/desktop/**",
      "apps/mobile/**",
      "packages/ui/**",
      "packages/ui-3d/**",
      "packages/mobile-ui/**",
      "tooling/desk-ui/**"
    ],
    docs: UI_DOCS
  },
  { globs: ["packages/ui-3d/**"], docs: [{ doc: "docs/ui/3d.md" }] },
  {
    globs: ["packages/theme/**"],
    docs: [{ doc: "DESIGN_SYSTEM.md" }, { doc: "docs/ui/create-a-theme.md" }]
  },
  { globs: ["apps/desktop/**"], docs: [guide("14. Desktop Rules")] },
  { globs: ["apps/mobile/**", "packages/mobile-ui/**"], docs: [guide("15. Mobile Rules")] },
  {
    globs: ["packages/db/**"],
    docs: [
      guide("6. Data and Auth Rules"),
      { doc: "docs/troubleshooting.md", section: "Password hashes after forking migrations" }
    ]
  },
  {
    globs: ["packages/auth/**"],
    docs: [
      guide("6. Data and Auth Rules"),
      { doc: "CONTEXT.md" },
      { doc: "docs/troubleshooting.md", section: "Auth and CORS" }
    ]
  },
  {
    // SYNC: the `graphql` path filter in .github/workflows/ci-pr.yml.
    globs: [
      "apps/api/src/features/**",
      "apps/api/src/schema/**",
      "apps/api/schema.graphql",
      "apps/web/src/graphql/**",
      "apps/mobile/src/graphql/**",
      "tooling/graphql-codegen/**"
    ],
    docs: [
      guide("8. GraphQL Rules"),
      { doc: "docs/troubleshooting.md", section: "GraphQL codegen and formatting" }
    ]
  },
  { globs: ["apps/api/src/features/**"], docs: [{ doc: "CONTEXT.md" }] },
  {
    globs: ["packages/billing/**", "apps/api/src/features/billing/**"],
    docs: [{ doc: "docs/billing.md" }]
  },
  { globs: ["Dockerfile.*"], docs: [guide("10. Docker Rules"), { doc: "docs/deploy.md" }] },
  { globs: [".github/workflows/**"], docs: [guide("17. Quality Gates")] },
  { globs: ["tooling/ci-runners/**"], docs: [{ doc: "docs/self-hosted-ci.md" }] },
  { globs: [".ai/**"], docs: [guide("18. AI Assistant Scaffold")] },
  { globs: [".ai/skills/**"], docs: [{ doc: "docs/agents/skill-authoring.md" }] },
  {
    globs: ["tooling/desk/**", "tooling/desk-ui/**"],
    docs: [{ doc: "docs/agents/agent-desk.md" }]
  },
  { globs: ["tooling/desk/src/server/**"], docs: [{ doc: "docs/agents/agent-desk-api.md" }] },
  { globs: ["docs/adr/**"], docs: [{ doc: "docs/adr/README.md" }] }
];

// path.matchesGlob skips dot segments under `*` and `**`. GitHub's path
// filters match them, so mask a leading dot in every segment on both sides.
const undot = (value) => value.replace(/(^|\/)\./g, "$1");

/** Glob match with GitHub path-filter semantics for dot files. */
export function matchGlob(file, glob) {
  return path.posix.matchesGlob(undot(file), undot(glob));
}

/** A directory is governed by a glob that matches inside it. */
function governs(glob, file, isDir) {
  if (!isDir) return matchGlob(file, glob);
  const literal = glob.split(/[*?[{]/)[0];
  return matchGlob(`${file}/x`, glob) || literal.startsWith(`${file}/`);
}

const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim();

/** Read every ADR's title, status, and declared `Applies to:` globs. */
export function loadAdrs(root = REPO_ROOT) {
  const dir = path.join(root, "docs/adr");
  const adrs = readdirSync(dir)
    .filter((name) => /^\d{4}-.*\.md$/.test(name))
    .sort()
    .map((name) => {
      const text = readFileSync(path.join(dir, name), "utf8");
      const status = plain(/^- Status:[ \t]*(.+)$/m.exec(text)?.[1] ?? "Unknown");
      const applies = /^- Applies to:[ \t]*(.+)$/m.exec(text)?.[1] ?? "";
      return {
        doc: `docs/adr/${name}`,
        number: name.slice(0, 4),
        title: /^# (.+)$/m.exec(text)?.[1].trim() ?? name,
        status,
        current: /^Accepted\b/.test(status),
        appliesTo: applies
          .split(",")
          .map((glob) => glob.trim().replace(/^`|`$/g, ""))
          .filter(Boolean)
      };
    });
  for (const adr of adrs) {
    const named = adr.current ? undefined : /ADR (\d{4})/.exec(adr.status)?.[1];
    adr.replacement = adrs.find((other) => other.number === named)?.doc ?? null;
  }
  return adrs;
}

/**
 * Resolve the docs that govern each path. Only declared globs match: an ADR
 * without an `Applies to:` line governs nothing, whatever its name says. Only
 * Accepted ADRs govern; others are context.
 */
export function resolveDocs(paths, { adrs, table = GUIDE_TABLE, isDir = () => false }) {
  const files = paths.map((file) => {
    const dir = isDir(file);
    const governing = [];
    const context = [];
    for (const adr of adrs) {
      const via = adr.appliesTo.find((glob) => governs(glob, file, dir));
      if (!via) continue;
      const { doc, title, status, replacement } = adr;
      if (adr.current) governing.push({ doc, title, status, via });
      else context.push({ doc, title, status, replacement, via });
    }
    for (const row of table) {
      const via = row.globs.find((glob) => governs(glob, file, dir));
      if (!via) continue;
      for (const entry of row.docs) {
        const known = governing.some((g) => g.doc === entry.doc && g.section === entry.section);
        if (!known) governing.push({ ...entry, via });
      }
    }
    return { path: file, governing, context };
  });
  return {
    files,
    ungoverned: files.filter((file) => file.governing.length === 0).map((file) => file.path)
  };
}

const MAX_LISTED = 5;

/** Group the result by doc for people; one path per doc entry. */
export function formatDocs({ files, ungoverned }) {
  const groups = new Map();
  for (const file of files) {
    for (const [kind, entries] of [
      ["governing", file.governing],
      ["context", file.context]
    ]) {
      for (const entry of entries) {
        const key = `${kind}\0${entry.doc}\0${entry.section ?? ""}`;
        if (!groups.has(key)) groups.set(key, { kind, entry, paths: [] });
        groups.get(key).paths.push(file.path);
      }
    }
  }
  const lines = [];
  const many = files.length > 1;
  const section = (kind, heading) => {
    const ofKind = [...groups.values()].filter((group) => group.kind === kind);
    const adrs = ofKind.filter((group) => group.entry.title);
    adrs.sort((a, b) => (a.entry.doc < b.entry.doc ? -1 : 1));
    const rows = [...adrs, ...ofKind.filter((group) => !group.entry.title)];
    if (rows.length === 0) return;
    lines.push(heading);
    for (const { entry, paths } of rows) {
      const label = entry.section ? `${entry.doc} § ${entry.section}` : entry.doc;
      const title = entry.title ? ` — ${entry.title}` : "";
      const status = entry.status && entry.status !== "Accepted" ? ` [${entry.status}]` : "";
      lines.push(`  ${label}${title}${status}`);
      if (entry.replacement) lines.push(`      replaced by ${entry.replacement}`);
      if (many) {
        for (const file of paths.slice(0, MAX_LISTED)) lines.push(`      ${file}`);
        if (paths.length > MAX_LISTED) lines.push(`      … and ${paths.length - MAX_LISTED} more`);
      }
    }
  };
  section("governing", "Governing docs (read before editing):");
  section("context", "Context only (not a current decision):");
  if (ungoverned.length > 0) {
    lines.push("No governing record:");
    for (const file of ungoverned) lines.push(`  ${file}`);
  }
  if (files.length === 0) lines.push("No paths to resolve.");
  return lines.join("\n");
}

export function git(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Lines in a text file; 0 for a binary or unreadable one, as numstat counts them. */
function lineCount(file) {
  try {
    const text = readFileSync(file, "utf8");
    return text.includes("\0") ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  } catch {
    return 0;
  }
}

/**
 * Every file changed in commits, the index, and the working tree since the
 * merge base with `base`, plus untracked files. Renames count as a delete
 * and an add, so a moved file shows its old path too.
 */
export function collectChanges(base = DEFAULT_BASE, root = REPO_ROOT) {
  const mergeBase = git(["merge-base", base, "HEAD"], root).trim();
  const status = new Map(
    git(["diff", "--name-status", "--no-renames", mergeBase], root)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [code, file] = line.split("\t");
        return [file, code[0]];
      })
  );
  const changes = git(["diff", "--numstat", "--no-renames", mergeBase], root)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, file] = line.split("\t");
      return {
        path: file,
        status: status.get(file) ?? "M",
        added: Number(added) || 0,
        deleted: Number(deleted) || 0
      };
    });
  for (const file of git(["ls-files", "--others", "--exclude-standard"], root)
    .split("\n")
    .filter(Boolean)) {
    const added = lineCount(path.join(root, file));
    changes.push({ path: file, status: "A", added, deleted: 0, untracked: true });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { mergeBase, changes };
}

function parseArgs(argv) {
  const options = { json: false, diff: false, base: DEFAULT_BASE, paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--diff" || arg.startsWith("--diff=")) {
      options.diff = true;
      const inline = arg.slice("--diff=".length);
      if (arg.includes("=")) options.base = inline;
      else if (argv[index + 1] && !argv[index + 1].startsWith("-")) options.base = argv[++index];
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else options.paths.push(arg);
  }
  if (options.diff && options.paths.length > 0) {
    throw new Error("Pass paths or --diff [base], not both.");
  }
  if (!options.diff && options.paths.length === 0) {
    throw new Error("Usage: pnpm docs:for <path...> | --diff [base] [--json]");
  }
  return options;
}

/** Repo-relative POSIX path; pnpm runs scripts at the root, INIT_CWD is the caller's directory. */
function toRepoPath(input) {
  const absolute = path.resolve(process.env.INIT_CWD ?? process.cwd(), input);
  const relative = path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Path is outside the repository: ${input}`);
  }
  return relative.replace(/\/$/, "") || ".";
}

const isRepoDir = (file) => {
  try {
    return statSync(path.join(REPO_ROOT, file)).isDirectory();
  } catch {
    return false;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const diff = options.diff ? collectChanges(options.base) : undefined;
    const paths = diff ? diff.changes.map((change) => change.path) : options.paths.map(toRepoPath);
    const result = resolveDocs(paths, { adrs: loadAdrs(), isDir: isRepoDir });
    if (options.json) {
      const header = diff ? { base: options.base, mergeBase: diff.mergeBase } : {};
      console.log(JSON.stringify({ ...header, ...result }, null, 2));
    } else {
      if (diff) {
        console.log(
          `Changed since ${options.base} (${diff.mergeBase.slice(0, 7)}): ${paths.length} files\n`
        );
      }
      console.log(formatDocs(result));
    }
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    console.error(stderr || (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
