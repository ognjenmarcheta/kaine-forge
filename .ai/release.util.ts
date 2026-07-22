import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { REPO_ROOT } from "./ai.util";

const WORKSPACE_ROOTS = ["apps", "packages", "tooling"] as const;
const ROOT_BUILD_CONFIGS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "tsconfig.json"
]);
// Workspaces that are not in any app's declared dependency graph but are
// hand-copied into every deployable image (see the packages/config COPY in
// Dockerfile.api and Dockerfile.web) and consumed via relative tsconfig
// extends. Changes here alter every image, so they affect all deployable apps.
const SHARED_BUILD_WORKSPACE_DIRS = new Set(["packages/config"]);

export interface WorkspacePackage {
  name: string;
  dir: string;
  internalDependencies: string[];
}

export interface DeployableApp {
  app: string;
  dockerfile: string;
  releaseBranch: string;
  workspaceDir: string;
  workspaceName: string;
}

const normalizePath = (value: string): string =>
  value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");

const internalWorkspaceDeps = (manifest: Record<string, unknown>): string[] => {
  const result = new Set<string>();
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

  for (const section of sections) {
    const deps = manifest[section];
    if (!deps || typeof deps !== "object") {
      continue;
    }

    for (const name of Object.keys(deps as Record<string, unknown>)) {
      if (name.startsWith("@repo/")) {
        result.add(name);
      }
    }
  }

  return [...result].sort((left, right) => left.localeCompare(right));
};

const dockerfileApp = (entry: string): string | null => {
  const match = normalizePath(entry).match(/^Dockerfile\.([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
};

const workspaceOwner = (
  filePath: string,
  workspaces: WorkspacePackage[]
): WorkspacePackage | null => {
  const normalized = normalizePath(filePath);
  const sorted = [...workspaces].sort((left, right) => right.dir.length - left.dir.length);

  for (const workspace of sorted) {
    if (normalized === workspace.dir || normalized.startsWith(`${workspace.dir}/`)) {
      return workspace;
    }
  }

  return null;
};

const dependencyClosureByApp = (
  deployableApps: DeployableApp[],
  workspaces: WorkspacePackage[]
): Map<string, Set<string>> => {
  const workspaceByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const closures = new Map<string, Set<string>>();

  const visit = (workspaceName: string, closure: Set<string>): void => {
    if (closure.has(workspaceName)) {
      return;
    }

    closure.add(workspaceName);
    const workspace = workspaceByName.get(workspaceName);
    if (!workspace) {
      return;
    }

    for (const dependency of workspace.internalDependencies) {
      visit(dependency, closure);
    }
  };

  for (const app of deployableApps) {
    const closure = new Set<string>();
    visit(app.workspaceName, closure);
    closures.set(app.app, closure);
  }

  return closures;
};

export const releaseBranchName = (app: string): string => `release/${app}`;

export const discoverWorkspacePackages = (rootDir = REPO_ROOT): WorkspacePackage[] => {
  const packages: WorkspacePackage[] = [];

  for (const scope of WORKSPACE_ROOTS) {
    const scopeDir = join(rootDir, scope);
    if (!existsSync(scopeDir)) {
      continue;
    }

    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = join(scopeDir, entry.name, "package.json");
      if (!existsSync(manifestPath)) {
        continue;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      if (typeof manifest.name !== "string") {
        throw new Error(
          `${relative(rootDir, manifestPath)}: package.json is missing a string name`
        );
      }

      packages.push({
        name: manifest.name,
        dir: normalizePath(relative(rootDir, join(scopeDir, entry.name))),
        internalDependencies: internalWorkspaceDeps(manifest)
      });
    }
  }

  return packages.sort((left, right) => left.dir.localeCompare(right.dir));
};

export const deployableAppsFromEntries = (
  entries: string[],
  workspaces: WorkspacePackage[]
): DeployableApp[] => {
  const apps: DeployableApp[] = [];

  for (const entry of entries) {
    const app = dockerfileApp(entry);
    if (!app) {
      continue;
    }

    const workspaceDir = `apps/${app}`;
    const workspace = workspaces.find((candidate) => candidate.dir === workspaceDir);
    if (!workspace) {
      throw new Error(
        `${entry}: deployable dockerfiles must map to an app workspace at ${workspaceDir}`
      );
    }

    apps.push({
      app,
      dockerfile: normalizePath(entry),
      releaseBranch: releaseBranchName(app),
      workspaceDir,
      workspaceName: workspace.name
    });
  }

  return apps.sort((left, right) => left.app.localeCompare(right.app));
};

export const discoverDeployableApps = (
  rootDir = REPO_ROOT,
  workspaces = discoverWorkspacePackages(rootDir)
): DeployableApp[] => deployableAppsFromEntries(readdirSync(rootDir), workspaces);

export const collectAffectedApps = (
  changedFiles: string[],
  deployableApps: DeployableApp[],
  workspaces: WorkspacePackage[]
): Set<string> => {
  const affected = new Set<string>();
  const dependencyClosures = dependencyClosureByApp(deployableApps, workspaces);

  for (const rawFile of changedFiles) {
    const file = normalizePath(rawFile);
    if (!file) {
      continue;
    }

    const dockerfileAppName = dockerfileApp(file);
    if (dockerfileAppName) {
      if (deployableApps.some((app) => app.app === dockerfileAppName)) {
        affected.add(dockerfileAppName);
      }
      continue;
    }

    if (ROOT_BUILD_CONFIGS.has(file)) {
      for (const app of deployableApps) {
        affected.add(app.app);
      }
      continue;
    }

    const owner = workspaceOwner(file, workspaces);
    if (!owner) {
      continue;
    }

    if (SHARED_BUILD_WORKSPACE_DIRS.has(owner.dir)) {
      for (const app of deployableApps) {
        affected.add(app.app);
      }
      continue;
    }

    for (const app of deployableApps) {
      const closure = dependencyClosures.get(app.app);
      if (closure?.has(owner.name)) {
        affected.add(app.app);
      }
    }
  }

  return affected;
};

export const resolveSelectedApps = (
  selectedApps: string[],
  deployableApps: DeployableApp[],
  autoAffectedApps: Set<string>
): string[] => {
  const allApps = deployableApps
    .map((app) => app.app)
    .sort((left, right) => left.localeCompare(right));

  if (selectedApps.length === 0) {
    return [...autoAffectedApps].sort((left, right) => left.localeCompare(right));
  }

  if (selectedApps.includes("all")) {
    return allApps;
  }

  const allowed = new Set(allApps);
  const explicit = new Set<string>();

  for (const app of selectedApps) {
    if (!allowed.has(app)) {
      throw new Error(`Unknown deployable app: ${app}`);
    }
    explicit.add(app);
  }

  return [...explicit].sort((left, right) => left.localeCompare(right));
};
