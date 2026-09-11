#!/usr/bin/env tsx

import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { REPO_ROOT } from "./ai.util";
import {
  applyCreateFeature,
  buildFeatureFiles,
  CreateFeatureError,
  deriveFeatureNames,
  parseCreateFeatureArgs,
  wiringTargets,
  type FeatureNames
} from "./create-feature.util";

const usage = `Usage:
  pnpm create:feature <singular-kebab> [options]

Options:
  --plural <kebab>   Plural form (default: "<singular>s")
  --label "<Text>"   Human label for navigation and headings (default: Title Case of plural)
  --write            Apply the changes (default: preview only)
  --no-generate      Skip the automatic "pnpm generate" after --write
  -h, --help         Show this message

Examples:
  pnpm create:feature invoice --write
  pnpm create:feature purchase-order --plural purchase-orders --label "Purchase orders" --write
`;

// The wiring targets plus any scaffold path that is already on disk, so the pure
// core sees a real collision instead of silently overwriting a file.
const readRepoFiles = (names: FeatureNames): Map<string, string> => {
  const files = new Map<string, string>();

  for (const path of [...wiringTargets, ...buildFeatureFiles(names).keys()]) {
    const absolute = join(REPO_ROOT, path);
    if (existsSync(absolute)) {
      files.set(path, readFileSync(absolute, "utf8"));
    }
  }

  return files;
};

const writeFiles = (paths: readonly string[], files: ReadonlyMap<string, string>): void => {
  for (const path of paths) {
    const content = files.get(path);
    if (content === undefined) {
      continue;
    }
    const absolute = join(REPO_ROOT, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
};

const run = (command: string, args: string[]): void => {
  execFileSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
};

// Formatting and import ordering are eslint's and prettier's job, not the
// generator's: reproducing import/order's group ranking here would be a second
// implementation of a rule that already exists.
const normalizeWrittenFiles = (paths: readonly string[]): void => {
  const sources = paths.filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));

  run("pnpm", ["exec", "prettier", "--log-level", "warn", "--write", ...paths]);
  run("pnpm", ["exec", "eslint", "--fix", ...sources]);
};

// packages/db/src/client.ts throws at import time without DATABASE_URL, and
// schema generation imports it. The pool is lazy, so the value only has to be
// present - it does not have to point at a reachable database.
const hasDatabaseUrl = (): boolean => {
  if (process.env["DATABASE_URL"]) {
    return true;
  }
  const envPath = join(REPO_ROOT, ".env");
  return existsSync(envPath) && /^DATABASE_URL=.+$/m.test(readFileSync(envPath, "utf8"));
};

const nextSteps = (names: FeatureNames): string => `Next steps:
  1. Edit packages/db/src/schema/${names.pluralKebab}.schema.ts - replace the placeholder
     title and body columns with the real ones.
  2. Match apps/api/src/features/${names.pluralKebab}/${names.pluralKebab}.{schema,type,util}.ts and
     apps/web/src/graphql/operations/${names.pluralKebab}.graphql to those columns, then: pnpm generate
  3. pnpm db:generate   # writes a new packages/db/drizzle/*.sql - review it before committing
  4. pnpm db:push       # touches your live database
  5. Translate packages/translation/src/locales/{de,sr}/${names.pluralKebab}.json and the
     navigation.${names.pluralKebab} keys - they currently hold English copy (issue #382).
  6. pnpm check
  7. pnpm test:e2e
`;

const main = (): void => {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(usage);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const options = parseCreateFeatureArgs(argv);
  const names = deriveFeatureNames(options);
  const result = applyCreateFeature(readRepoFiles(names), names);

  console.log(chalk.bold(options.write ? "Creating feature" : "Preview feature"));
  console.log(`  ${names.pluralKebab} ${chalk.gray(`(${names.label})`)}`);
  console.log();
  console.log(chalk.bold(`Created (${result.createdPaths.length})`));
  for (const path of result.createdPaths) {
    console.log(`  ${chalk.green("+")} ${path}`);
  }
  console.log();
  console.log(chalk.bold(`Wired (${result.changedPaths.length})`));
  for (const path of result.changedPaths) {
    console.log(`  ${chalk.yellow("~")} ${path}`);
  }
  console.log();

  if (!options.write) {
    console.log(chalk.gray("Dry run only. Re-run with --write to apply these changes."));
    return;
  }

  const written = [...result.createdPaths, ...result.changedPaths];
  writeFiles(written, result.files);
  normalizeWrittenFiles(written);

  if (!options.generate) {
    console.log(chalk.gray("Skipped pnpm generate (--no-generate)."));
  } else if (!hasDatabaseUrl()) {
    console.log(
      chalk.yellow("Skipped pnpm generate: DATABASE_URL is not set. Run pnpm env:ensure first.")
    );
  } else {
    run("pnpm", ["generate"]);
  }

  console.log();
  console.log(nextSteps(names));
};

try {
  main();
} catch (error: unknown) {
  if (error instanceof CreateFeatureError) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
