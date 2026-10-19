import { execFileSync } from "node:child_process";

import {
  collectAffectedApps,
  discoverDeployableApps,
  discoverWorkspacePackages,
  type DeployableApp,
  originSyncState,
  releaseBranchName,
  resolveSelectedApps
} from "./release.util";

export interface ReleaseAppsOptions {
  apps: string[];
  base?: string;
  dryRun: boolean;
}

export interface AppPlan {
  app: DeployableApp;
  action: "create" | "update";
  baseRef: string;
  changedFiles: string[];
  reason: "explicit" | "affected";
  releaseRef: string;
  remoteExists: boolean;
}

export interface ReleaseAppsContext {
  /** Repository root the git commands run in. */
  repoRoot: string;
  /** Receives the plans before any branch moves, so a CLI can print them first. */
  onPlans?: (plans: AppPlan[]) => void;
  /** Where `git fetch` and `git push` write their progress. The CLI inherits the terminal. */
  stdio?: "inherit" | "ignore";
}

export type ReleaseAppsOutcome =
  | { status: "behind" }
  | { status: "no-updates" }
  | { status: "planned"; plans: AppPlan[] }
  | { status: "updated"; plans: AppPlan[] };

interface Git {
  run: (args: string[]) => string;
  tryRun: (args: string[]) => string | null;
  hasRef: (ref: string) => boolean;
  isAncestor: (ancestorRef: string, descendantRef: string) => boolean;
  /** For fetch and push, whose progress goes to the terminal instead of a captured string. */
  stream: (args: string[], stdio: "inherit" | "ignore") => void;
}

const createGit = (repoRoot: string): Git => {
  const run = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();

  const tryRun = (args: string[]): string | null => {
    try {
      return run(args);
    } catch {
      return null;
    }
  };

  return {
    run,
    tryRun,
    hasRef: (ref) => tryRun(["rev-parse", "--verify", ref]) !== null,
    isAncestor: (ancestorRef, descendantRef) =>
      tryRun(["merge-base", "--is-ancestor", ancestorRef, descendantRef]) !== null,
    stream: (args, stdio) => {
      execFileSync("git", args, { cwd: repoRoot, stdio });
    }
  };
};

const ensureCleanWorktree = (git: Git): void => {
  const status = git.run(["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error(
      "Working tree is not clean. Commit or stash changes before running pnpm release:apps."
    );
  }
};

const ensureMain = (git: Git): void => {
  const branch = git.run(["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error(`pnpm release:apps must run from main. Current branch: ${branch}`);
  }
};

const syncStateWithOriginMain = (git: Git): "synced" | "behind" => {
  const localHead = git.run(["rev-parse", "HEAD"]);
  const originHead = git.tryRun(["rev-parse", "origin/main"]);
  if (!originHead) {
    throw new Error(
      "origin/main is unavailable. Fetch main from origin before running pnpm release:apps."
    );
  }

  const syncState = originSyncState({
    localHead,
    originHead,
    headIsAncestorOfOrigin: git.isAncestor("HEAD", "origin/main")
  });

  if (syncState === "diverged") {
    throw new Error(
      "Local main is not synchronized with origin/main. Pull the latest main commit, then rerun pnpm release:apps."
    );
  }

  return syncState;
};

const changedFilesBetween = (git: Git, baseRef: string): string[] => {
  const output = git.run(["diff", "--name-only", `${baseRef}..HEAD`]);
  return output.length === 0 ? [] : output.split("\n").filter(Boolean);
};

const fallbackBaseRef = (git: Git): string => git.tryRun(["rev-parse", "HEAD^"]) ?? "HEAD";

const releaseBaseRef = (git: Git, app: DeployableApp, explicitBase: string | undefined): string => {
  if (explicitBase) {
    return explicitBase;
  }

  const remoteRef = `refs/remotes/origin/${releaseBranchName(app.app)}`;
  if (git.hasRef(remoteRef)) {
    return remoteRef;
  }

  const localRef = `refs/heads/${releaseBranchName(app.app)}`;
  if (git.hasRef(localRef)) {
    return localRef;
  }

  return fallbackBaseRef(git);
};

const ensureFastForwardable = (git: Git, releaseRef: string): void => {
  if (!git.isAncestor(releaseRef, "HEAD")) {
    throw new Error(
      `${releaseRef} is not an ancestor of HEAD. Reconcile the release branch before running pnpm release:apps.`
    );
  }
};

const buildPlans = (options: ReleaseAppsOptions, git: Git, repoRoot: string): AppPlan[] => {
  const workspaces = discoverWorkspacePackages(repoRoot);
  const deployableApps = discoverDeployableApps(repoRoot, workspaces);
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
    const remoteExists = git.hasRef(remoteRef);
    const releaseRef = remoteExists ? remoteRef : git.hasRef(localRef) ? localRef : branchName;

    const explicitlySelected = explicitApps.includes(app.app);
    if (hasExplicitSelection && !explicitlySelected) {
      continue;
    }

    const reason = explicitlySelected ? "explicit" : "affected";
    const baseRef = releaseBaseRef(git, app, options.base);
    const changedFiles = changedFilesBetween(git, baseRef);
    const autoAffected = collectAffectedApps(changedFiles, deployableApps, workspaces);
    const targeted = explicitlySelected || autoAffected.has(app.app);
    if (!targeted) {
      continue;
    }

    if (remoteExists) {
      ensureFastForwardable(git, remoteRef);
    } else if (git.hasRef(localRef)) {
      ensureFastForwardable(git, localRef);
    }

    const headSha = git.run(["rev-parse", "HEAD"]);
    const currentReleaseSha = remoteExists
      ? git.run(["rev-parse", remoteRef])
      : git.hasRef(localRef)
        ? git.run(["rev-parse", localRef])
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

/**
 * Move each affected app's release branch to HEAD by fast-forward and push it.
 * Pure git against `context.repoRoot`; the CLI in release-apps.ts owns argument
 * parsing and console output, so this path can run against a temporary repository.
 */
export const runReleaseApps = (
  options: ReleaseAppsOptions,
  context: ReleaseAppsContext
): ReleaseAppsOutcome => {
  const git = createGit(context.repoRoot);
  const stdio = context.stdio ?? "inherit";

  ensureMain(git);
  ensureCleanWorktree(git);
  git.stream(["fetch", "origin", "--prune"], stdio);
  if (syncStateWithOriginMain(git) === "behind") {
    return { status: "behind" };
  }

  const plans = buildPlans(options, git, context.repoRoot);
  if (plans.length === 0) {
    return { status: "no-updates" };
  }

  context.onPlans?.(plans);
  if (options.dryRun) {
    return { status: "planned", plans };
  }

  for (const plan of plans) {
    git.stream(["update-ref", `refs/heads/${plan.app.releaseBranch}`, "HEAD"], "ignore");
    git.stream(["push", "origin", `HEAD:refs/heads/${plan.app.releaseBranch}`], stdio);
  }

  return { status: "updated", plans };
};
