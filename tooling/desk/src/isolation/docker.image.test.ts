import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  IMAGE_REPOSITORY,
  PINNED,
  buildImage,
  imageHash,
  imageTagFor,
  inspectImage,
  pnpmVersionOf,
  readImageContext
} from "./docker.image";
import { fakeExec, ok, fail } from "../testing/exec.fake";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const dockerDir = fileURLToPath(new URL("../../docker/", import.meta.url));

describe("pnpmVersionOf", () => {
  it.each([
    ['{"packageManager":"pnpm@10.29.3"}', "10.29.3"],
    ['{"packageManager":"pnpm@10.29.3+sha512.abc"}', "10.29.3"],
    ['{"packageManager":"npm@10.0.0"}', null],
    ['{"packageManager":"pnpm@latest"}', null],
    ["{}", null],
    ["not json", null]
  ])("reads %s as %s", (text, expected) => {
    expect(pnpmVersionOf(text)).toBe(expected);
  });
});

describe("image hash and tag", () => {
  const files = new Map([
    ["desk.Dockerfile", "FROM x"],
    ["desk-entry.mjs", "a"]
  ]);
  const args = { PNPM_VERSION: "10.29.3", CLAUDE_VERSION: "2.1.282" };

  it("is stable for the same inputs, whatever the insertion order", () => {
    const reordered = new Map([...files].reverse());
    expect(imageHash(files, args)).toBe(imageHash(reordered, args));
    expect(imageHash(files, args)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a file, a version, or the pnpm version changes", () => {
    const base = imageHash(files, args);
    expect(imageHash(new Map([...files, ["desk-entry.mjs", "b"]]), args)).not.toBe(base);
    expect(imageHash(files, { ...args, CLAUDE_VERSION: "2.1.283" })).not.toBe(base);
    expect(imageHash(files, { ...args, PNPM_VERSION: "10.30.0" })).not.toBe(base);
    expect(imageHash(new Map([...files, ["extra.mjs", "x"]]), args)).not.toBe(base);
  });

  it("names the image by the first 12 hex digits", () => {
    expect(imageTagFor("0123456789abcdef".repeat(4))).toBe(`${IMAGE_REPOSITORY}:0123456789ab`);
  });
});

describe("readImageContext", () => {
  it("reads the real Dockerfile and scripts with the repository's pnpm version", async () => {
    const context = await readImageContext(repoRoot);
    expect([...context.files.keys()].sort()).toEqual(
      [
        "desk-auth.mjs",
        "desk-bridge.mjs",
        "desk-entry.mjs",
        "desk-fetch.mjs",
        "desk-probe.mjs",
        "desk-proxy.mjs",
        "desk-workspace.mjs",
        "desk.Dockerfile",
        "receipt.mjs"
      ].sort()
    );
    expect(context.buildArgs).toEqual({
      NODE_IMAGE: PINNED.nodeImage,
      PNPM_VERSION: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      CLAUDE_VERSION: PINNED.claude,
      CODEX_VERSION: PINNED.codex
    });
    expect(context.tag).toBe(imageTagFor(context.hash));
    const rootPackage = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
    expect(rootPackage.packageManager).toContain(`pnpm@${context.buildArgs.PNPM_VERSION}`);
  });

  it("pins the Node image by digest and the CLIs by exact version", () => {
    expect(PINNED.nodeImage).toMatch(/^node:24-slim@sha256:[0-9a-f]{64}$/);
    expect(PINNED.claude).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PINNED.codex).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("refuses a repository without a pnpm packageManager", async () => {
    await expect(readImageContext(path.join(repoRoot, "tooling", "desk"))).rejects.toThrow(
      /packageManager/
    );
  });

  it("copies only the files named in the Dockerfile and keeps the image unprivileged", async () => {
    const dockerfile = await readFile(path.join(dockerDir, "desk.Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/^USER 1000:1000$/m);
    expect(dockerfile).not.toMatch(/\bsudo\b/);
    expect(dockerfile).not.toMatch(/:latest/);
    const copy = /^COPY (.+) \/opt\/desk\/$/m.exec(dockerfile)?.[1]?.split(" ") ?? [];
    const present = new Set(await readdir(dockerDir));
    for (const file of copy) {
      if (file !== "receipt.mjs") expect(present.has(file), file).toBe(true);
    }
    expect(copy.some((file) => file.endsWith(".test.mjs"))).toBe(false);
  });
});

describe("buildImage", () => {
  it("builds from a staged context, never from the repository, with labels and build args", async () => {
    const context = await readImageContext(repoRoot);
    const { exec, calls } = fakeExec([{ argv: ["docker", "build"], reply: ok("built") }]);
    const result = await buildImage(exec, context, { noCache: true });
    expect(result).toEqual({ ok: true, tag: context.tag });
    const argv = calls[0]?.argv ?? [];
    expect(argv.slice(0, 2)).toEqual(["docker", "build"]);
    expect(argv).toContain("--no-cache");
    expect(argv[argv.indexOf("--tag") + 1]).toBe(context.tag);
    const labels = argv.flatMap((arg, index) => (arg === "--label" ? [argv[index + 1]] : []));
    expect(labels).toContain("kaine-desk=1");
    expect(labels).toContain("kaine-desk.kind=image");
    expect(labels).toContain(`kaine-desk.hash=${context.hash}`);
    const buildArgs = argv.flatMap((arg, index) =>
      arg === "--build-arg" ? [argv[index + 1]] : []
    );
    expect(buildArgs).toContain(`CLAUDE_VERSION=${PINNED.claude}`);
    expect(buildArgs).toContain(`NODE_IMAGE=${PINNED.nodeImage}`);
    const staged = argv.at(-1) ?? "";
    expect(staged).not.toBe(repoRoot);
    expect(staged).toContain("kaine-desk-image-");
    expect(argv[argv.indexOf("--file") + 1]).toBe(path.join(staged, "desk.Dockerfile"));
  });

  it("reports the end of a failing build", async () => {
    const context = await readImageContext(repoRoot);
    const { exec } = fakeExec([
      { argv: ["docker", "build"], reply: { code: 1, stderr: "step 3 failed\nboom" } }
    ]);
    const result = await buildImage(exec, context);
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("boom");
  });
});

describe("inspectImage", () => {
  const tag = "kaine-desk-worker:abc";
  it("reports a current image with its size", async () => {
    const { exec } = fakeExec([
      { argv: ["docker", "image", "inspect"], reply: ok("2090000000\n") }
    ]);
    expect(await inspectImage(exec, tag)).toEqual({ status: "current", tag, size: 2090000000 });
  });

  it("tells a stale image from a missing one by the other tags on the machine", async () => {
    const stale = fakeExec([
      { argv: ["docker", "image", "inspect"], reply: fail("no such image") },
      { argv: ["docker", "image", "ls"], reply: ok("kaine-desk-worker:old\n") }
    ]);
    expect(await inspectImage(stale.exec, tag)).toEqual({
      status: "stale",
      tag,
      present: ["kaine-desk-worker:old"]
    });
    const missing = fakeExec([
      { argv: ["docker", "image", "inspect"], reply: fail("no such image") },
      { argv: ["docker", "image", "ls"], reply: ok("") }
    ]);
    expect(await inspectImage(missing.exec, tag)).toEqual({ status: "missing", tag });
  });

  it("reports an unreachable daemon", async () => {
    const { exec } = fakeExec([
      { argv: ["docker", "image", "inspect"], reply: fail("Cannot connect to the Docker daemon") },
      { argv: ["docker", "image", "ls"], reply: fail("Cannot connect to the Docker daemon") }
    ]);
    expect(await inspectImage(exec, tag)).toMatchObject({ status: "unreachable" });
  });
});
