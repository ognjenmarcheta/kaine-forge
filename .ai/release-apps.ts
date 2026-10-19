#!/usr/bin/env tsx

import chalk from "chalk";

import { REPO_ROOT } from "./ai.util";
import { type AppPlan, type ReleaseAppsOptions, runReleaseApps } from "./release-apps.util";

const usage = `Usage:
  pnpm release:apps [--apps <app[,app]|all>] [--base <ref>] [--dry-run]

Defaults:
  - Run from main after merge, with a clean working tree.
  - Fetch origin before calculating release branch updates.
  - Auto-detect affected deployable apps from Dockerfile.<app> files plus the workspace graph.

Examples:
  pnpm release:apps
  pnpm release:apps --dry-run
  pnpm release:apps --apps api
  pnpm release:apps --apps all
  pnpm release:apps --base HEAD~3
`;

const parseListArg = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseArgs = (): ReleaseAppsOptions => {
  const args = process.argv.slice(2);
  const options: ReleaseAppsOptions = {
    apps: [],
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--apps") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--apps requires a value");
      }
      options.apps.push(...parseListArg(value));
      index += 1;
      continue;
    }
    if (arg === "--base") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--base requires a value");
      }
      options.base = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
  }

  return {
    ...options,
    apps: [...new Set(options.apps)]
  };
};

const printPlans = (plans: AppPlan[], dryRun: boolean): void => {
  const heading = dryRun ? "Planned release branch updates" : "Release branch updates";
  console.log(chalk.cyan(heading));
  console.log();

  for (const plan of plans) {
    const icon = plan.action === "create" ? chalk.green("+") : chalk.yellow("~");
    console.log(
      `  ${icon} ${plan.app.releaseBranch} <- HEAD (${plan.reason}; ${plan.changedFiles.length} changed file${plan.changedFiles.length === 1 ? "" : "s"} since ${plan.baseRef})`
    );
  }

  console.log();
};

const main = (): void => {
  const options = parseArgs();
  const outcome = runReleaseApps(options, {
    repoRoot: REPO_ROOT,
    stdio: "inherit",
    onPlans: (plans) => printPlans(plans, options.dryRun)
  });

  if (outcome.status === "behind") {
    console.log(
      chalk.gray(
        "origin/main advanced past HEAD; the queued Release run for the newer commit updates the release branches."
      )
    );
    return;
  }
  if (outcome.status === "no-updates") {
    console.log(chalk.gray("No deployable app release branches need updates."));
    return;
  }
  if (outcome.status === "planned") {
    return;
  }

  console.log(chalk.green("Updated release branches:"));
  for (const plan of outcome.plans) {
    console.log(`  - ${plan.app.releaseBranch}`);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exit(1);
}
