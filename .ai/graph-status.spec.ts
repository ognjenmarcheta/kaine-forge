import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GRAPHIFY_VERSION, graphStatus, recordBuild } from "./hooks/graph-status.mjs";

const git = (repo: string, ...args: string[]): void => {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
};

const commit = (repo: string, path: string, content: string): void => {
  writeFileSync(join(repo, path), content);
  git(repo, "add", path);
  git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", path);
};

describe("graphStatus", () => {
  it("tracks the graph from absent to fresh to stale by commits and changed files", () => {
    const repo = mkdtempSync(join(tmpdir(), "kaine-graph-"));
    try {
      git(repo, "init", "-b", "main");
      commit(repo, ".gitignore", "graphify-out/\n");
      commit(repo, "a.ts", "export const a = 1;\n");
      expect(graphStatus(repo, GRAPHIFY_VERSION).state).toBe("absent");

      mkdirSync(join(repo, "graphify-out"));
      writeFileSync(join(repo, "graphify-out", "graph.json"), "{}\n");
      expect(graphStatus(repo, GRAPHIFY_VERSION)).toMatchObject({ state: "stale", commits: null });

      // An edit made before the build is already in the graph.
      writeFileSync(join(repo, "a.ts"), "export const a = 2;\n");
      const earlier = new Date(Date.now() - 60_000);
      utimesSync(join(repo, "a.ts"), earlier, earlier);
      recordBuild(repo, GRAPHIFY_VERSION);
      expect(graphStatus(repo, GRAPHIFY_VERSION)).toEqual({
        state: "fresh",
        commits: 0,
        files: 0,
        versionMismatch: null
      });

      writeFileSync(join(repo, "a.ts"), "export const a = 4;\n");
      const later = new Date(Date.now() + 60_000);
      utimesSync(join(repo, "a.ts"), later, later);
      expect(graphStatus(repo, GRAPHIFY_VERSION)).toMatchObject({ state: "stale", files: 1 });

      commit(repo, "a.ts", "export const a = 3;\n");
      commit(repo, "b.ts", "export const b = 1;\n");
      expect(graphStatus(repo, "0.0.1")).toMatchObject({
        state: "stale",
        commits: 2,
        versionMismatch: "0.0.1"
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
