import { readFileSync } from "node:fs";
import console from "node:console";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

import {
  DEFAULT_BASE,
  REPO_ROOT,
  collectChanges,
  formatDocs,
  git,
  loadAdrs,
  matchGlob,
  resolveDocs
} from "./docs-for.mjs";

/** A diff above this many authored lines is hard to review in one pass. */
export const SIZE_LIMIT = 800;

/**
 * The CI path filters this report must agree with, read from ci-pr.yml itself:
 * `graphql` from Detect Changed Paths, `source` and `changeset` from
 * Changeset Required.
 */
export function ciPathFilters(workflowText) {
  const jobs = parse(workflowText).jobs;
  const filters = (job, id) => parse(jobs[job].steps.find((step) => step.id === id).with.filters);
  const changeset = filters("changeset-required", "changes");
  return {
    graphql: filters("detect-paths", "filter").graphql,
    releasable: changeset.source,
    changeset: changeset.changeset
  };
}

// SYNC: tooling/graphql-codegen/codegen.ts outputs and apps/api `schema:generate`.
const GRAPHQL_GENERATED = [
  "apps/api/schema.graphql",
  "apps/web/src/graphql/generated/**",
  "apps/mobile/src/graphql/generated/**"
];
// packages/db/drizzle.config.ts `out`. The journal only grows, so it is not checked.
const SHIPPED_MIGRATIONS = [
  "packages/db/drizzle/*.sql",
  "packages/db/drizzle/meta/*_snapshot.json"
];
const NOT_AUTHORED = [
  "pnpm-lock.yaml",
  "**/CHANGELOG.md",
  ...GRAPHQL_GENERATED,
  "**/*.generated.*",
  "packages/db/drizzle/meta/**",
  "AGENTS.md",
  "CLAUDE.md",
  "REVIEW.md",
  ".serena/**"
];

/** Change classes by path. `releasable`, `changeset`, and `graphql` come from CI. */
export function changeClasses(filters) {
  return {
    releasable: filters.releasable,
    changeset: filters.changeset,
    graphql: filters.graphql,
    "graphql-generated": GRAPHQL_GENERATED,
    migration: ["packages/db/drizzle/**"],
    db: ["packages/db/src/**"],
    api: ["apps/api/src/**"],
    auth: ["packages/auth/**"],
    jobs: ["packages/jobs/**"],
    storage: ["packages/storage/**", "apps/api/src/features/storage/**"],
    ui: ["{apps,packages,tooling}/**/*.{tsx,css}"],
    theme: ["packages/theme/**"],
    i18n: ["packages/translation/**"],
    source: ["{apps,packages,tooling}/**/*.{ts,tsx,mts,cts}"],
    scripts: ["scripts/**"],
    test: ["**/*.test.{ts,tsx,mjs,js}", "**/*.e2e.ts"],
    deps: ["**/package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"],
    ai: [".ai/**"],
    "ai-generated": ["AGENTS.md", "CLAUDE.md", "REVIEW.md", ".serena/**"],
    docs: ["docs/**", "*.md"],
    docker: ["Dockerfile.*"],
    ci: [".github/**"]
  };
}

export function classify(file, classes) {
  return Object.entries(classes)
    .filter(([, globs]) => globs.some((glob) => matchGlob(file, glob)))
    .map(([name]) => name);
}

/**
 * Review checklist items and the change classes that make each apply.
 * `adr` applies when docs:for finds a governing Accepted ADR.
 * SYNC: .ai/review.md — keep the sections and items in step with it.
 */
export const CHECKLIST = [
  [
    "Scope",
    "always",
    "One primary intent; supporting deltas only; split tagalongs into their own change."
  ],
  ["Correctness", "always", "Behavior matches the request; every changed line traces to it."],
  [
    "Correctness",
    ["api", "auth", "ui"],
    "Auth, empty-state, and error-path edge cases are handled."
  ],
  ["Correctness", ["source", "scripts"], "No silent swallowing of errors that should surface."],
  ["Security, Auth & Tenancy", "always", "No secrets, tokens, or .ai.local/ material committed."],
  [
    "Security, Auth & Tenancy",
    ["api", "db", "graphql"],
    "Organization-scoped data uses Authenticated Organization Scope, never a client-supplied organization id."
  ],
  [
    "Security, Auth & Tenancy",
    ["api", "auth"],
    "Authorization and membership checks hold on every route to the same operation."
  ],
  [
    "Security, Auth & Tenancy",
    ["auth"],
    "Tokens, keys, invitations, and reset links are bound, expire, and are single-use where intended."
  ],
  [
    "Security, Auth & Tenancy",
    ["auth"],
    "CORS, trusted origins, and cookie/session assumptions stay consistent with @repo/auth (ADR 0008)."
  ],
  [
    "Security, Auth & Tenancy",
    ["graphql"],
    "A new organization-scoped resolver is proved by a two-organization test that executes it."
  ],
  [
    "Security, Auth & Tenancy",
    ["jobs"],
    "Jobs take the organization from the stored record and re-check membership when they run."
  ],
  [
    "Security, Auth & Tenancy",
    ["storage"],
    "File access stays organization-scoped; URLs bind operation, object, organization, and expiry."
  ],
  [
    "Security, Auth & Tenancy",
    ["api", "auth", "jobs"],
    "Log fields carry no secrets, tokens, passwords, or full request bodies."
  ],
  [
    "Architecture & Boundaries",
    ["source"],
    "Imports use @repo/* public exports only; FDD naming {feature}.{purpose}.ts(x)."
  ],
  [
    "Architecture & Boundaries",
    ["ui"],
    "Web/desktop UI uses @repo/ui; React Native uses @repo/mobile-ui."
  ],
  [
    "Data & GraphQL",
    ["db", "migration"],
    "Persistence schema, validators, and types live in @repo/db."
  ],
  [
    "Data & GraphQL",
    ["graphql"],
    "SDL, resolvers, and adapters follow feature layout; registry updated for new features."
  ],
  [
    "Data & GraphQL",
    ["graphql", "graphql-generated"],
    "Operations edited at source and pnpm generate run; generated outputs not hand-edited."
  ],
  [
    "Data & GraphQL",
    ["migration"],
    "Shipped migrations are not rewritten; schema changes are new migrations in load-bearing order."
  ],
  [
    "Data & GraphQL",
    ["migration", "db"],
    "Renames, drops, and type changes on deployed data follow expand/contract."
  ],
  ["Performance", ["api", "graphql"], "No N+1 reads; list reads are paginated or bounded."],
  ["Performance", ["api"], "Cache keys for organization-scoped data include the organization."],
  ["Performance", ["migration"], "A new index is justified by a query plan."],
  [
    "UI & i18n",
    ["ui", "theme"],
    "Token-only styling through the theme utilities; no raw colors or arbitrary [var(--ds-*)]."
  ],
  [
    "UI & i18n",
    ["ui", "theme"],
    "pnpm ui:check passes and docs/ui/guidelines.md is followed; theme changes ship pnpm theme:build output."
  ],
  [
    "UI & i18n",
    ["ui", "i18n"],
    "User-facing strings live in translation JSON behind i18n helpers."
  ],
  [
    "UI & i18n",
    ["ui"],
    "Accessibility and component patterns match DESIGN_SYSTEM.md for the surface."
  ],
  [
    "Quality Gates",
    ["source", "scripts"],
    "Tests cover the new or changed behavior at the nearest useful layer."
  ],
  ["Quality Gates", ["test"], "New or changed tests pass the kaine-test value gate."],
  [
    "Quality Gates",
    ["source"],
    "No new any; unknown only at intake boundaries; SAFETY comments state the checked invariant."
  ],
  [
    "Quality Gates",
    ["deps"],
    "No new dependency where the standard library or an installed one covers it."
  ],
  [
    "Quality Gates",
    ["source", "test", "ci"],
    "The quality bar is not lowered: no new suppressions, skipped tests, or removed assertions."
  ],
  [
    "Quality Gates",
    ["releasable"],
    "A changeset is included, or the PR is labeled release:skip-changeset."
  ],
  [
    "Domain Language",
    ["api", "graphql", "ui", "docs"],
    "Public names use CONTEXT.md terms and avoid its listed synonyms."
  ],
  [
    "Domain Language",
    ["adr"],
    "The change does not contradict a governing accepted ADR without saying so."
  ],
  [
    "Domain Language",
    ["source", "ci", "docker", "ai"],
    "Behavior, config, or architecture changes update the authoritative doc in the same change."
  ],
  ["Template & AI Hygiene", "always", "No AI self-attribution in commits or the PR body."],
  [
    "Template & AI Hygiene",
    ["ai"],
    "Assistant guidance edited only under .ai/, then pnpm ai:install and pnpm ai:doctor."
  ],
  [
    "Template & AI Hygiene",
    ["ai-generated"],
    "Generated agent files (AGENTS.md, CLAUDE.md, REVIEW.md, .serena/*) are not hand-edited."
  ],
  [
    "Template & AI Hygiene",
    ["docker"],
    "Deployable app changes respect the Dockerfile contracts and the Release workflow."
  ]
].map(([section, when, item]) => ({ section, when, item }));

export function applicableItems(classNames) {
  const present = new Set(classNames);
  return CHECKLIST.filter(
    ({ when }) => when === "always" || when.some((name) => present.has(name))
  );
}

const touched = (changes, globs) =>
  changes.filter((change) => globs.some((glob) => matchGlob(change.path, glob)));

/**
 * Findings a script can prove from paths, statuses, and line counts. Each
 * names a rule and the fix; a file-level finding names its path, and
 * preReview adds the line.
 */
export function findings(changes, filters) {
  const found = [];
  const releasable = touched(changes, filters.releasable);
  if (releasable.length > 0 && touched(changes, filters.changeset).length === 0) {
    found.push({
      rule: "changeset-missing",
      message: `${releasable.length} releasable file(s) changed (first: ${releasable[0].path}) without a .changeset entry. Run \`pnpm changeset\`, or label the PR release:skip-changeset if nothing releasable changed.`
    });
  }

  const authored = changes
    .filter((change) => !NOT_AUTHORED.some((glob) => matchGlob(change.path, glob)))
    .reduce((sum, change) => sum + change.added + change.deleted, 0);
  if (authored > SIZE_LIMIT) {
    found.push({
      rule: "diff-too-large",
      message: `${authored} authored lines changed (limit ${SIZE_LIMIT}, lockfiles and generated files excluded). Split the change by intent.`
    });
  }

  const generated = touched(changes, GRAPHQL_GENERATED);
  const sources = touched(changes, [...filters.graphql, "pnpm-lock.yaml"]).filter(
    (change) => !generated.includes(change)
  );
  if (sources.length === 0) {
    for (const change of generated) {
      found.push({
        rule: "generated-graphql-edited",
        path: change.path,
        message:
          "Generated GraphQL output changed with no change to its sources. Edit the SDL or operation, then run `pnpm generate`."
      });
    }
  }

  for (const change of touched(changes, SHIPPED_MIGRATIONS)) {
    if (change.status === "A") continue;
    found.push({
      rule: "migration-edited",
      path: change.path,
      message: `Shipped migration ${change.status === "D" ? "deleted" : "edited in place"}. Add a new migration instead (docs/troubleshooting.md, ADR 0008).`
    });
  }
  return found;
}

/** First changed line of a file in the working tree, from a zero-context diff. */
function firstChangedLine(mergeBase, change, root) {
  if (change.untracked || change.status === "D") return 1;
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/m.exec(
    git(["diff", "-U0", "--no-renames", mergeBase, "--", change.path], root)
  );
  return Math.max(Number(hunk?.[1] ?? 1), 1);
}

/** Build the whole report. Throws only when git or the CI workflow cannot be read. */
export function preReview({ base = DEFAULT_BASE, root = REPO_ROOT } = {}) {
  const { mergeBase, changes } = collectChanges(base, root);
  const filters = ciPathFilters(
    readFileSync(path.join(root, ".github/workflows/ci-pr.yml"), "utf8")
  );
  const classes = changeClasses(filters);
  const files = changes.map((change) => ({ ...change, classes: classify(change.path, classes) }));
  const docs = resolveDocs(
    changes.map((change) => change.path),
    { adrs: loadAdrs(root) }
  );
  const governedByAdr = docs.files.some((file) => file.governing.some((entry) => entry.title));
  const classNames = [...files.flatMap((file) => file.classes), ...(governedByAdr ? ["adr"] : [])];
  const byPath = new Map(changes.map((change) => [change.path, change]));
  return {
    base,
    mergeBase,
    files,
    docs,
    checklist: applicableItems(classNames).map(({ section, item }) => ({ section, item })),
    findings: findings(changes, filters).map((finding) =>
      finding.path
        ? { ...finding, line: firstChangedLine(mergeBase, byPath.get(finding.path), root) }
        : finding
    )
  };
}

export function formatReport(report) {
  const lines = [
    `Pre-review against ${report.base} (merge base ${report.mergeBase.slice(0, 7)})`,
    ""
  ];
  lines.push(`Changed files (${report.files.length}):`);
  const width = Math.min(Math.max(0, ...report.files.map((file) => file.path.length)), 60);
  for (const file of report.files) {
    const counts = `+${file.added} -${file.deleted}`;
    lines.push(
      `  ${file.status}  ${file.path.padEnd(width)}  ${counts.padEnd(11)} ${file.classes.join(", ")}`
    );
  }
  lines.push(
    "",
    formatDocs(report.docs),
    "",
    `Checklist items that apply (${report.checklist.length}):`
  );
  let section = "";
  for (const entry of report.checklist) {
    if (entry.section !== section) lines.push(`  ${(section = entry.section)}`);
    lines.push(`    [ ] ${entry.item}`);
  }
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("Findings: none that a script can prove. Review the checklist items above.");
  } else {
    lines.push(`Findings (${report.findings.length}):`);
    for (const finding of report.findings) {
      const where = finding.path ? `${finding.path}:${finding.line}` : "(whole diff)";
      lines.push(`  ${where}  ${finding.rule}`, `      ${finding.message}`);
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter(
    (arg, index) => arg !== "--json" && arg !== "--base" && argv[index - 1] !== "--base"
  );
  const baseIndex = argv.indexOf("--base");
  if (unknown.length > 0 || (baseIndex >= 0 && !argv[baseIndex + 1])) {
    console.error("Usage: pnpm review:pre [--base <ref>] [--json]");
    process.exitCode = 1;
  } else {
    try {
      const report = preReview({ base: baseIndex >= 0 ? argv[baseIndex + 1] : DEFAULT_BASE });
      console.log(argv.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
    } catch (error) {
      const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
      console.error(stderr || (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    }
  }
}
