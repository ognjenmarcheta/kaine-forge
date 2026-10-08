import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { diffAgainstBase } from "../git";
import {
  TransferError,
  containerDiff,
  ensureIssueVolumes,
  readStateFile,
  syncIn,
  syncOut,
  workspaceVolumes
} from "./docker.workspace";
import { jsonReply, type FakeRun } from "../testing/docker.fake";
import { LOCK_KEY, createDockerEnv, patchAfter, type DockerEnv } from "../testing/docker.testing";
import { hermeticExec } from "../testing/git.repo";

let env: DockerEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const open = async (): Promise<DockerEnv> => {
  env = await createDockerEnv();
  return env;
};

const mountSource = (run: FakeRun): string => {
  const bind = run.mounts.find((mount) => mount.startsWith("type=bind"));
  const source = /src=([^,]+)/.exec(bind ?? "")?.[1];
  if (source === undefined) throw new Error("no bind mount");
  return source;
};

const names = (e: DockerEnv): string[] =>
  e.docker.runs.map((run) => `${run.labels["kaine-desk.kind"]}`);

describe("ensureIssueVolumes", () => {
  it("creates the workspace, state and store volumes with labels, once", async () => {
    const e = await open();
    expect(await ensureIssueVolumes(e.context)).toBe(true);
    expect(await ensureIssueVolumes(e.context)).toBe(false);
    expect([...e.docker.volumes.keys()].sort()).toEqual([
      "kaine-desk-repo-1a2b3c-7-state",
      "kaine-desk-repo-1a2b3c-7-store",
      "kaine-desk-repo-1a2b3c-7-ws"
    ]);
    expect(e.docker.volumes.get("kaine-desk-repo-1a2b3c-7-ws")).toEqual({
      "kaine-desk": "1",
      "kaine-desk.repo": "repo-1a2b3c",
      "kaine-desk.issue": "7",
      "kaine-desk.kind": "ws"
    });
    expect(workspaceVolumes(e.context).workspace).toBe("kaine-desk-repo-1a2b3c-7-ws");
  });

  it("refuses a context that has no issue", async () => {
    const e = await open();
    expect(() => workspaceVolumes({ ...e.context, owner: null })).toThrow(TransferError);
  });
});

describe("syncIn", () => {
  it("sends the work in progress and the agent files, and asks for the bundle only when needed", async () => {
    const e = await open();
    await e.repo.write("src/a.ts", "export const a = 1;\n");
    await e.repo.write(".claude/skills/kaine-test/SKILL.md", "skill\n");
    await e.repo.write(".gitignore", ".claude/skills/\n");
    await e.repo.commit("ignore skills");
    const base = await e.repo.git(["rev-parse", "HEAD"]);
    const target = { worktree: e.repo.dir, baseSha: base };
    await e.repo.write("src/a.ts", "export const a = 2;\n");

    const seen: { bundle: boolean; patch: string; skill: boolean; input: unknown }[] = [];
    let calls = 0;
    e.docker.handlers.set("desk-workspace.mjs sync", async (run) => {
      calls += 1;
      const staging = mountSource(run);
      const bundle = await readFile(path.join(staging, "base.bundle")).then(
        () => true,
        () => false
      );
      seen.push({
        bundle,
        patch: await readFile(path.join(staging, "wip.patch"), "utf8"),
        skill: await readFile(
          path.join(staging, "agent-files", ".claude", "skills", "kaine-test", "SKILL.md"),
          "utf8"
        ).then(
          () => true,
          () => false
        ),
        input: JSON.parse(run.input ?? "{}")
      });
      if (calls === 1) return jsonReply({ status: "needs-bundle" });
      const host = await diffAgainstBase(hermeticExec, e.repo.dir, base);
      return jsonReply({
        status: "ready",
        diffHash: host.diffHash,
        checkpointTree: "c".repeat(40),
        lockKey: LOCK_KEY,
        installedKey: LOCK_KEY
      });
    });

    const synced = await syncIn(e.context, target, ["/state/receipts-builder.jsonl"]);

    expect(synced.fresh).toBe(true);
    expect(seen.map((entry) => entry.bundle)).toEqual([false, true]);
    expect(seen[0]?.patch).toContain("+export const a = 2;");
    expect(seen[0]?.skill).toBe(true);
    expect(seen[0]?.input).toMatchObject({
      baseSha: base,
      baseBranch: "main",
      removeFiles: ["/state/receipts-builder.jsonl"]
    });
    expect((seen[0]?.input as { flags: string[] }).flags[0]).toBe("diff");
    // No install: the helper reported the install key as current.
    expect(names(e)).toEqual(["import", "import"]);
    // The staging folder is gone after the call.
    await expect(
      readFile(path.join(mountSource(e.docker.runs[0]!), "wip.patch"))
    ).rejects.toThrow();
  });

  it("does not send a bundle when the volume already has the base commit", async () => {
    const e = await open();
    e.answerSync();
    const synced = await syncIn(e.context, e.target);
    expect(synced.checkpointHash).toMatch(/^[0-9a-f]{64}$/);
    expect(names(e)).toEqual(["import"]);
  });

  it("fails when the container hash differs from the host hash", async () => {
    const e = await open();
    e.docker.handlers.set("desk-workspace.mjs sync", () =>
      jsonReply({
        status: "ready",
        diffHash: "0".repeat(64),
        checkpointTree: "c".repeat(40),
        lockKey: LOCK_KEY,
        installedKey: LOCK_KEY
      })
    );
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/diff hash mismatch/);
  });

  it("removes the container of a helper that failed, because a timeout can leave it behind", async () => {
    const e = await open();
    e.docker.handlers.set("desk-workspace.mjs sync", (run) => {
      e.docker.containers.set(run.name, run.labels);
      return { code: 1, stderr: "killed by a timeout" };
    });
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/killed by a timeout/);
    expect([...e.docker.containers.keys()]).toEqual([]);
  });

  it("fails when the helper prints something that is not a reply", async () => {
    const e = await open();
    e.docker.handlers.set("desk-workspace.mjs sync", () => ({ stdout: "oops\n" }));
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/no JSON/);
    e.docker.handlers.set("desk-workspace.mjs sync", () => jsonReply({ status: "weird" }));
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/unexpected result/);
  });

  it("refuses to bundle when HEAD is not the base commit", async () => {
    const e = await open();
    e.docker.handlers.set("desk-workspace.mjs sync", () => jsonReply({ status: "needs-bundle" }));
    await e.repo.write("moved.txt", "x\n");
    await e.repo.commit("HEAD moves");
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/not the base/);
  });

  it("fetches through the registry proxy and installs offline when the lockfile changed", async () => {
    const e = await open();
    e.answerSync({ installedKey: null });
    e.docker.handlers.set("desk-fetch.mjs", () => ({ code: 0 }));
    e.docker.handlers.set("desk-workspace.mjs install", () => jsonReply({ status: "installed" }));

    await syncIn(e.context, e.target);

    expect(names(e)).toEqual(["import", "proxy", "fetch", "install"]);
    const [, proxy, fetch, install] = e.docker.runs;
    expect(proxy?.command.slice(-1)).toEqual(["dependencies"]);
    expect(fetch?.mounts.some((mount) => mount.includes("dst=/socket"))).toBe(true);
    expect(fetch?.mounts).toContain("type=volume,src=kaine-desk-repo-1a2b3c-7-ws,dst=/workspace");
    expect(install?.argv).toContain("--network");
    expect(install?.argv[install.argv.indexOf("--network") + 1]).toBe("none");
    // The proxy container and its socket volume are gone.
    expect([...e.docker.containers.keys()]).toEqual([]);
    expect([...e.docker.volumes.keys()].some((name) => name.endsWith("-sock"))).toBe(false);
  });

  it("cleans up the proxy even when the fetch fails", async () => {
    const e = await open();
    e.answerSync({ installedKey: null });
    e.docker.handlers.set("desk-fetch.mjs", () => ({ code: 1, stderr: "ERR_PNPM_FETCH" }));
    await expect(syncIn(e.context, e.target)).rejects.toThrow(/ERR_PNPM_FETCH/);
    expect([...e.docker.containers.keys()]).toEqual([]);
    expect([...e.docker.volumes.keys()].some((name) => name.endsWith("-sock"))).toBe(false);
  });
});

describe("syncOut", () => {
  const exportReply = (env_: DockerEnv, patch: string, hash: string) =>
    env_.docker.handlers.set("desk-workspace.mjs diff", () =>
      jsonReply({
        status: "ok",
        diffHash: hash,
        bytes: patch.length,
        patch: Buffer.from(patch).toString("base64"),
        nameStatus: null
      })
    );

  const prepare = async (e: DockerEnv, change: () => Promise<void>) => {
    e.answerSync();
    const synced = await syncIn(e.context, e.target);
    const patch = await patchAfter(e, change);
    return { synced, patch };
  };

  it("applies the container's patch to the host worktree and checks the hash", async () => {
    const e = await open();
    const { synced, patch } = await prepare(e, async () => {
      await e.repo.write("src/new.ts", "export const n = 1;\n");
      await e.repo.write("bin/data.bin", Buffer.from([0, 1, 2, 255]));
    });
    // The hash the container would report: base plus the change.
    await e.repo.write("src/new.ts", "export const n = 1;\n");
    await e.repo.write("bin/data.bin", Buffer.from([0, 1, 2, 255]));
    const expected = (await diffAgainstBase(hermeticExec, e.repo.dir, e.baseSha)).diffHash;
    await e.repo.git(["clean", "--quiet", "-fd"]);
    exportReply(e, patch, expected);

    const out = await syncOut(e.context, e.target, synced);

    expect(out).toMatchObject({
      changed: true,
      diffHash: expected,
      files: ["bin/data.bin", "src/new.ts"]
    });
    expect(await readFile(path.join(e.repo.dir, "src/new.ts"), "utf8")).toBe(
      "export const n = 1;\n"
    );
    expect([...(await readFile(path.join(e.repo.dir, "bin/data.bin")))]).toEqual([0, 1, 2, 255]);
  });

  it("reports no change for an empty patch", async () => {
    const e = await open();
    const { synced } = await prepare(e, async () => undefined);
    exportReply(e, "", synced.checkpointHash);
    expect(await syncOut(e.context, e.target, synced)).toEqual({
      changed: false,
      diffHash: synced.checkpointHash,
      files: []
    });
  });

  it("refuses a patch for a protected path and changes nothing", async () => {
    const e = await open();
    const { synced, patch } = await prepare(e, () => e.repo.write(".husky/pre-commit", "evil\n"));
    exportReply(e, patch, "f".repeat(64));
    await expect(syncOut(e.context, e.target, synced)).rejects.toThrow(/refused.*Protected path/s);
    await expect(readFile(path.join(e.repo.dir, ".husky/pre-commit"), "utf8")).rejects.toThrow();
  });

  it("refuses a patch above the limit that the helper reports", async () => {
    const e = await open();
    e.answerSync();
    const synced = await syncIn(e.context, e.target);
    e.docker.handlers.set("desk-workspace.mjs diff", () =>
      jsonReply({ status: "too-large", diffHash: "f".repeat(64), bytes: 9_999_999 })
    );
    await expect(syncOut(e.context, e.target, synced)).rejects.toThrow(/9999999 bytes/);
  });

  it("refuses to apply when the worktree changed while the container ran", async () => {
    const e = await open();
    const { synced, patch } = await prepare(e, () => e.repo.write("src/new.ts", "x\n"));
    exportReply(e, patch, "f".repeat(64));
    await e.repo.write("edited-on-host.txt", "the engineer typed this\n");
    await expect(syncOut(e.context, e.target, synced)).rejects.toThrow(
      /changed while the container ran/
    );
    expect(await readFile(path.join(e.repo.dir, "edited-on-host.txt"), "utf8")).toContain("typed");
    await expect(readFile(path.join(e.repo.dir, "src/new.ts"), "utf8")).rejects.toThrow();
  });

  it("reports a hash mismatch after the patch is applied", async () => {
    const e = await open();
    const { synced, patch } = await prepare(e, () => e.repo.write("src/new.ts", "x\n"));
    exportReply(e, patch, "e".repeat(64));
    await expect(syncOut(e.context, e.target, synced)).rejects.toThrow(/hash mismatch/);
  });

  it("asks the export helper for the patch since the checkpoint, with the size cap", async () => {
    const e = await open();
    e.answerSync();
    const synced = await syncIn(e.context, e.target);
    exportReply(e, "", synced.checkpointHash);
    await syncOut(e.context, e.target, synced);
    const run = e.docker.runs.at(-1);
    expect(run?.labels["kaine-desk.kind"]).toBe("export");
    expect(JSON.parse(run?.input ?? "{}")).toMatchObject({
      since: "checkpoint",
      maxBytes: 1024 * 1024
    });
  });
});

describe("containerDiff and readStateFile", () => {
  it("returns the container diff with its file list", async () => {
    const e = await open();
    const nameStatus = Buffer.from("A\0src/new.ts\0M\0a.txt\0").toString("base64");
    e.docker.handlers.set("desk-workspace.mjs diff", () =>
      jsonReply({
        status: "ok",
        diffHash: "d".repeat(64),
        bytes: 5,
        patch: Buffer.from("patch").toString("base64"),
        nameStatus
      })
    );
    expect(await containerDiff(e.context, e.target)).toEqual({
      patch: "patch",
      diffHash: "d".repeat(64),
      files: [
        { path: "src/new.ts", status: "added" },
        { path: "a.txt", status: "modified" }
      ]
    });
  });

  it("reads a state file, and a missing file as null", async () => {
    const e = await open();
    e.docker.handlers.set("cat", (run) =>
      run.command.at(-1) === "/state/receipts-builder.jsonl" ? { stdout: "{}\n" } : { code: 1 }
    );
    expect(await readStateFile(e.context, "/state/receipts-builder.jsonl")).toBe("{}\n");
    expect(await readStateFile(e.context, "/state/receipts-planner.jsonl")).toBeNull();
  });
});
