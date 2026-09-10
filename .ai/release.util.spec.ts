import { describe, expect, it } from "vitest";

import {
  collectAffectedApps,
  deployableAppsFromEntries,
  originSyncState,
  releaseBranchName,
  resolveSelectedApps,
  type WorkspacePackage
} from "./release.util";

const workspaces: WorkspacePackage[] = [
  {
    name: "@repo/api",
    dir: "apps/api",
    internalDependencies: ["@repo/auth", "@repo/config", "@repo/db"]
  },
  {
    name: "@repo/web",
    dir: "apps/web",
    internalDependencies: ["@repo/auth", "@repo/config", "@repo/ui"]
  },
  {
    name: "@repo/auth",
    dir: "packages/auth",
    internalDependencies: ["@repo/config", "@repo/db"]
  },
  {
    name: "@repo/config",
    dir: "packages/config",
    internalDependencies: []
  },
  {
    name: "@repo/db",
    dir: "packages/db",
    internalDependencies: []
  },
  {
    name: "@repo/ui",
    dir: "packages/ui",
    internalDependencies: []
  }
];

const deployableApps = deployableAppsFromEntries(["Dockerfile.api", "Dockerfile.web"], workspaces);

describe("deployableAppsFromEntries", () => {
  it("derives deployable apps from root dockerfiles", () => {
    expect(deployableApps).toEqual([
      {
        app: "api",
        dockerfile: "Dockerfile.api",
        releaseBranch: "release/api",
        workspaceDir: "apps/api",
        workspaceName: "@repo/api"
      },
      {
        app: "web",
        dockerfile: "Dockerfile.web",
        releaseBranch: "release/web",
        workspaceDir: "apps/web",
        workspaceName: "@repo/web"
      }
    ]);
  });

  it("errors when a dockerfile has no matching app workspace", () => {
    expect(() =>
      deployableAppsFromEntries(["Dockerfile.api", "Dockerfile.worker"], workspaces)
    ).toThrow(/apps\/worker/);
  });
});

describe("releaseBranchName", () => {
  it("uses stable release branches per app", () => {
    expect(releaseBranchName("api")).toBe("release/api");
    expect(releaseBranchName("web")).toBe("release/web");
  });
});

describe("originSyncState", () => {
  it("treats an identical HEAD and origin/main as synced", () => {
    expect(
      originSyncState({
        localHead: "aaaaaaa",
        originHead: "aaaaaaa",
        headIsAncestorOfOrigin: true
      })
    ).toBe("synced");
  });

  it("treats a HEAD that origin/main already contains as behind", () => {
    expect(
      originSyncState({
        localHead: "aaaaaaa",
        originHead: "bbbbbbb",
        headIsAncestorOfOrigin: true
      })
    ).toBe("behind");
  });

  it("treats a HEAD outside origin/main history as diverged", () => {
    expect(
      originSyncState({
        localHead: "aaaaaaa",
        originHead: "bbbbbbb",
        headIsAncestorOfOrigin: false
      })
    ).toBe("diverged");
  });
});

describe("collectAffectedApps", () => {
  it("marks a deployable app affected when its dockerfile changes", () => {
    expect(collectAffectedApps(["Dockerfile.web"], deployableApps, workspaces)).toEqual(
      new Set(["web"])
    );
  });

  it("marks a deployable app affected when its own app files change", () => {
    expect(
      collectAffectedApps(
        ["apps/api/src/features/todos/todos.router.ts"],
        deployableApps,
        workspaces
      )
    ).toEqual(new Set(["api"]));
  });

  it("fans shared package changes out to dependent deployable apps", () => {
    expect(collectAffectedApps(["packages/ui/src/index.ts"], deployableApps, workspaces)).toEqual(
      new Set(["web"])
    );
  });

  it("includes transitive dependents for shared package changes", () => {
    expect(collectAffectedApps(["packages/db/src/index.ts"], deployableApps, workspaces)).toEqual(
      new Set(["api", "web"])
    );
  });

  it("treats root build config changes as affecting all deployable apps", () => {
    expect(collectAffectedApps(["package.json"], deployableApps, workspaces)).toEqual(
      new Set(["api", "web"])
    );
    expect(collectAffectedApps(["turbo.json"], deployableApps, workspaces)).toEqual(
      new Set(["api", "web"])
    );
  });

  it("treats .npmrc as a root build config copied into every image", () => {
    expect(collectAffectedApps([".npmrc"], deployableApps, workspaces)).toEqual(
      new Set(["api", "web"])
    );
  });

  it("marks only the api app affected when the esm-extension script changes", () => {
    expect(
      collectAffectedApps(["scripts/fix-esm-extensions.mjs"], deployableApps, workspaces)
    ).toEqual(new Set(["api"]));
  });

  it("ignores root files no dockerfile copies", () => {
    expect(
      collectAffectedApps(
        [".nvmrc", "scripts/sync-mobile-design-tokens.mjs"],
        deployableApps,
        workspaces
      )
    ).toEqual(new Set());
  });

  it("resolves shared config changes through the declared dependency graph", () => {
    expect(
      collectAffectedApps(
        ["packages/config/typescript/tsconfig.node.json"],
        deployableApps,
        workspaces
      )
    ).toEqual(new Set(["api", "web"]));

    expect(
      collectAffectedApps(["packages/config/eslint/base.js"], deployableApps, workspaces)
    ).toEqual(new Set(["api", "web"]));
  });

  it("ignores docs-only changes outside deployable app inputs", () => {
    expect(
      collectAffectedApps(["README.md", "docs/release-checklist.md"], deployableApps, workspaces)
    ).toEqual(new Set());
  });
});

describe("resolveSelectedApps", () => {
  it("uses auto-detected apps when no explicit selection is provided", () => {
    expect(resolveSelectedApps([], deployableApps, new Set(["web"]))).toEqual(["web"]);
  });

  it("supports selecting all deployable apps explicitly", () => {
    expect(resolveSelectedApps(["all"], deployableApps, new Set(["web"]))).toEqual(["api", "web"]);
  });

  it("uses an explicit app list as the release target set", () => {
    expect(resolveSelectedApps(["api", "web"], deployableApps, new Set())).toEqual(["api", "web"]);
  });

  it("rejects unknown explicit app names", () => {
    expect(() => resolveSelectedApps(["worker"], deployableApps, new Set())).toThrow(
      /Unknown deployable app/
    );
  });
});
