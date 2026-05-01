#!/usr/bin/env tsx

import chalk from "chalk";
import { execFileSync } from "node:child_process";

import { REPO_ROOT } from "./ai.util";
import {
  collectAffectedApps,
  discoverDeployableApps,
  discoverWorkspacePackages,
  type DeployableApp,
  releaseBranchName,
  resolveSelectedApps
} from "./release.util";

interface CliOptions {
  apps: string[];
  base?: string;
  dryRun: boolean;
}

interface AppPlan {
  app: DeployableApp;
  action: "create" | "update";
  baseRef: string;
  changedFiles: string[];
  reason: "explicit" | "affected";
  releaseRef: string;
  remoteExists: boolean;
}

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

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
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

const runGit = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

const tryGit = (args: string[]): string | null => {
  try {
    return runGit(args);
  } catch {
    return null;
  }
};

const hasRef = (ref: string): boolean => tryGit(["rev-parse", "--verify", ref]) !== null;

const ensureCleanWorktree = (): void => {
  const status = runGit(["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes before running pnpm release:apps."
    );
  }
};

const ensureMain = (): void => {
  const branch = runGit(["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`pnpm release:apps must run from main. Current branch: ${branch}`);
  }
};

const ensureSyncedWithOriginMain = (): void => {
  const localHead = runGit(["rev-parse", "HEAD"]);
  const originHead = tryGit(["rev-parse", "origin/main"]);
  if (!originHead) {
    throw new Error(
      "origin/main is unavailable. Fetch main from origin before running pnpm release:apps."
    );
  }
  if (localHead !== originHead) {
    throw new Error(
      "Local main is not synchronized with origin/main. Pull the latest main commit, then rerun pnpm release:apps."
    );
  }
};

const fetchOrigin = (): void => {
  execFileSync("git", ["fetch", "origin", "--prune"], {
    cwd: REPO_ROOT,
    stdio: "inherit"
  });
};

const changedFilesBetween = (baseRef: string): string[] => {
  const output = runGit(["diff", "--name-only", `${baseRef}..HEAD`]);
  return output.length === 0 ? [] : output.split("\n").filter(Boolean);
};

const fallbackBaseRef = (): string => {
  const parent = tryGit(["rev-parse", "HEAD^"]);
  return parent ?? "HEAD";
};

const releaseBaseRef = (app: DeployableApp, explicitBase: string | undefined): string => {
  if (explicitBase) {
    return explicitBase;
  }

  const remoteRef = `refs/remotes/origin/${releaseBranchName(app.app)}`;
  if (hasRef(remoteRef)) {
    return remoteRef;
  }

  const localRef = `refs/heads/${releaseBranchName(app.app)}`;
  if (hasRef(localRef)) {
    return localRef;
  }

  return fallbackBaseRef();
};

const ensureFastForwardable = (releaseRef: string): void => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", releaseRef, "HEAD"], {
      cwd: REPO_ROOT,
      stdio: "ignore"
    });
  } catch {
    throw new Error(
      `${releaseRef} is not an ancestor of HEAD. Reconcile the release branch before running pnpm release:apps.`
    );
  }
};

const buildPlans = (options: CliOptions): AppPlan[] => {
  const workspaces = discoverWorkspacePackages();
  const deployableApps = discoverDeployableApps(REPO_ROOT, workspaces);
  if (deployableApps.length === 0) {
    throw new Error("No deployable apps found. Add top-level Dockerfile.<app> files first.");
  }

  const hasExplicitSelection = options.apps.length > 0;
  const explicitApps = resolveSelectedApps(options.apps, deployableApps, new Set<string>());
  const plans: AppPlan[] = [];

  for (const app of deployableApps) {
    const branchName = releaseBranchName(app.app);
    const remoteRef = `refs/remotes/origin/${branchName}`;
    const localRef = `refs/heads/${branchName}`;
    const remoteExists = hasRef(remoteRef);
    const releaseRef = remoteExists ? remoteRef : hasRef(localRef) ? localRef : branchName;

    const explicitlySelected = explicitApps.includes(app.app);
    if (hasExplicitSelection && !explicitlySelected) {
      continue;
    }

    const reason = explicitlySelected ? "explicit" : "affected";
    const baseRef = releaseBaseRef(app, options.base);
    const changedFiles = changedFilesBetween(baseRef);
    const autoAffected = collectAffectedApps(changedFiles, deployableApps, workspaces);
    const targeted = explicitlySelected || autoAffected.has(app.app);
    if (!targeted) {
      continue;
    }

    if (remoteExists) {
      ensureFastForwardable(remoteRef);
    } else if (hasRef(localRef)) {
      ensureFastForwardable(localRef);
    }

    const headSha = runGit(["rev-parse", "HEAD"]);
    const currentReleaseSha = remoteExists
      ? runGit(["rev-parse", remoteRef])
      : hasRef(localRef)
        ? runGit(["rev-parse", localRef])
        : null;

    if (currentReleaseSha === headSha) {
      continue;
    }

    plans.push({
      app,
      action: remoteExists ? "update" : "create",
      baseRef,
      changedFiles,
      reason,
      releaseRef,
      remoteExists
    });
  }

  return plans.sort((left, right) => left.app.app.localeCompare(right.app.app));
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

const updateLocalRef = (branchName: string): void => {
  execFileSync("git", ["update-ref", `refs/heads/${branchName}`, "HEAD"], {
    cwd: REPO_ROOT,
    stdio: "ignore"
  });
};

const pushReleaseBranch = (branchName: string): void => {
  execFileSync("git", ["push", "origin", `HEAD:refs/heads/${branchName}`], {
    cwd: REPO_ROOT,
    stdio: "inherit"
  });
};

const main = (): void => {
  const options = parseArgs();

  ensureMain();
  ensureCleanWorktree();
  fetchOrigin();
  ensureSyncedWithOriginMain();

  const plans = buildPlans(options);
  if (plans.length === 0) {
    console.log(chalk.gray("No deployable app release branches need updates."));
    return;
  }

  printPlans(plans, options.dryRun);
  if (options.dryRun) {
    return;
  }

  for (const plan of plans) {
    updateLocalRef(plan.app.releaseBranch);
    pushReleaseBranch(plan.app.releaseBranch);
  }

  console.log(chalk.green("Updated release branches:"));
  for (const plan of plans) {
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
