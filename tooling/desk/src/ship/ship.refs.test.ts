import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { REFS_BASELINE_FILE } from "./ship.contract";
import {
  baselineAfterCommit,
  readRefsBaseline,
  recordRefsBaseline,
  shipRefViolations,
  writeRefsBaseline
} from "./ship.refs";
import type { RefsSnapshot } from "../git";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const BRANCH = "KAINE-7-feat-x";

const snapshot = (over: Partial<RefsSnapshot> = {}): RefsSnapshot => ({
  head: A,
  branch: BRANCH,
  refs: { [`refs/heads/${BRANCH}`]: A, "refs/heads/main": A, "refs/remotes/origin/main": A },
  remotes: { "remote.origin.url": "git@example.test:o/r.git" },
  stash: [],
  ...over
});

const dirs: string[] = [];
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), "desk-refs-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("shipRefViolations", () => {
  it("reports nothing for equal snapshots", () => {
    expect(shipRefViolations(snapshot(), snapshot(), BRANCH)).toEqual([]);
  });

  it("reports a moved HEAD, a changed branch and a rewritten remote", () => {
    const moved = snapshot({
      head: B,
      branch: "detached-other",
      remotes: { "remote.origin.url": "git@evil.test:o/r.git" }
    });
    expect(
      shipRefViolations(snapshot(), moved, BRANCH)
        .map((v) => v.kind)
        .sort()
    ).toEqual(["branch-changed", "head-moved", "remote-changed"]);
  });

  it("reports this branch's own ref and a tag", () => {
    const current = snapshot({
      refs: {
        [`refs/heads/${BRANCH}`]: B,
        "refs/heads/main": A,
        "refs/remotes/origin/main": A,
        "refs/tags/v1": C
      }
    });
    expect(
      shipRefViolations(snapshot(), current, BRANCH)
        .map((v) => v.subject)
        .sort()
    ).toEqual([`refs/heads/${BRANCH}`, "refs/tags/v1"]);
  });

  it("ignores refs git shares between worktrees: other branches, remote-tracking refs, the stash", () => {
    const current = snapshot({
      refs: {
        [`refs/heads/${BRANCH}`]: A,
        "refs/heads/main": B,
        "refs/heads/KAINE-9-fix-other": C,
        "refs/remotes/origin/main": C
      },
      stash: ["deadbeef"]
    });
    expect(shipRefViolations(snapshot(), current, BRANCH)).toEqual([]);
  });
});

describe("baselineAfterCommit", () => {
  it("moves HEAD and the branch ref to the ship commit, and nothing else", () => {
    const after = baselineAfterCommit(snapshot(), BRANCH, B);
    expect(after.head).toBe(B);
    expect(after.refs[`refs/heads/${BRANCH}`]).toBe(B);
    expect(after.refs["refs/heads/main"]).toBe(A);
    const current = snapshot({
      head: B,
      refs: { ...snapshot().refs, [`refs/heads/${BRANCH}`]: B }
    });
    expect(shipRefViolations(after, current, BRANCH)).toEqual([]);
  });
});

describe("the baseline file", () => {
  it("round-trips a snapshot", async () => {
    const dir = await tempDir();
    await writeRefsBaseline(dir, snapshot());
    await expect(readRefsBaseline(dir)).resolves.toEqual(snapshot());
  });

  it("is null when missing, not JSON, or the wrong shape", async () => {
    const dir = await tempDir();
    await expect(readRefsBaseline(dir)).resolves.toBeNull();
    await writeFile(path.join(dir, REFS_BASELINE_FILE), "{nope");
    await expect(readRefsBaseline(dir)).resolves.toBeNull();
    await writeFile(path.join(dir, REFS_BASELINE_FILE), JSON.stringify({ head: 1 }));
    await expect(readRefsBaseline(dir)).resolves.toBeNull();
  });

  it("recordRefsBaseline stores what the git port reports", async () => {
    const dir = await tempDir();
    const stored = await recordRefsBaseline(
      { refsSnapshot: () => Promise.resolve(snapshot()) },
      "/wt",
      dir
    );
    expect(stored).toEqual(snapshot());
    await expect(readRefsBaseline(dir)).resolves.toEqual(snapshot());
  });
});
