import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Exec } from "../ports";
import { DESK_LABEL, LABEL_KIND } from "./docker.names";

/**
 * The worker image. Its tag is a hash of the Dockerfile, the scripts that go
 * into it, and the pinned versions. Any change gives a new tag, so a rebuild is
 * always an explicit step (`pnpm desk docker build`) and `desk doctor` can tell
 * that the image on the machine is stale.
 */

export const IMAGE_REPOSITORY = "kaine-desk-worker";

/**
 * Versions in the image. The Claude and Codex versions are the ones the Phase 2
 * spike verified. A bump is a deliberate edit here, then a rebuild.
 */
export const PINNED = {
  nodeImage: "node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20",
  claude: "2.1.282",
  codex: "0.147.0"
} as const;

const DOCKERFILE = "desk.Dockerfile";
const DOCKER_FILES = [
  DOCKERFILE,
  "desk-auth.mjs",
  "desk-bridge.mjs",
  "desk-entry.mjs",
  "desk-fetch.mjs",
  "desk-probe.mjs",
  "desk-proxy.mjs",
  "desk-workspace.mjs"
] as const;
/** The receipt hook lives with the other desk hooks and is copied into the same context. */
const RECEIPT_HOOK = "receipt.mjs";

const dockerDirectory = (): string => fileURLToPath(new URL("../../docker/", import.meta.url));
const hookPath = (): string => fileURLToPath(new URL("../../hooks/receipt.mjs", import.meta.url));

export interface ImageContext {
  /** File name in the build context, mapped to its content. */
  readonly files: ReadonlyMap<string, string>;
  readonly buildArgs: Readonly<Record<string, string>>;
  readonly hash: string;
  /** `kaine-desk-worker:<first 12 hex of the hash>`. */
  readonly tag: string;
}

/** The pnpm version in the `packageManager` field (`pnpm@10.29.3` or `pnpm@10.29.3+sha512...`). */
export const pnpmVersionOf = (packageJson: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(packageJson);
    const field =
      typeof parsed === "object" && parsed !== null && "packageManager" in parsed
        ? parsed.packageManager
        : undefined;
    const match = typeof field === "string" ? /^pnpm@(\d+\.\d+\.\d+)(?:\+.*)?$/.exec(field) : null;
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const imageHash = (
  files: ReadonlyMap<string, string>,
  buildArgs: Readonly<Record<string, string>>
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        files: [...files.entries()].sort(([a], [b]) => a.localeCompare(b)),
        buildArgs: Object.entries(buildArgs).sort(([a], [b]) => a.localeCompare(b))
      })
    )
    .digest("hex");

export const imageTagFor = (hash: string): string => `${IMAGE_REPOSITORY}:${hash.slice(0, 12)}`;

/** Read the build inputs. The pnpm version comes from the repository's `packageManager`. */
export const readImageContext = async (repoRoot: string): Promise<ImageContext> => {
  const pnpm = pnpmVersionOf(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  if (pnpm === null) {
    throw new Error("package.json has no 'packageManager' field like pnpm@10.29.3.");
  }
  const files = new Map<string, string>();
  for (const name of DOCKER_FILES) {
    files.set(name, await readFile(path.join(dockerDirectory(), name), "utf8"));
  }
  files.set(RECEIPT_HOOK, await readFile(hookPath(), "utf8"));
  const buildArgs = {
    NODE_IMAGE: PINNED.nodeImage,
    PNPM_VERSION: pnpm,
    CLAUDE_VERSION: PINNED.claude,
    CODEX_VERSION: PINNED.codex
  };
  const hash = imageHash(files, buildArgs);
  return { files, buildArgs, hash, tag: imageTagFor(hash) };
};

export type ImageState =
  | { readonly status: "current"; readonly tag: string; readonly size: number }
  | { readonly status: "stale"; readonly tag: string; readonly present: readonly string[] }
  | { readonly status: "missing"; readonly tag: string }
  | { readonly status: "unreachable"; readonly tag: string; readonly detail: string };

/** Is the image for the current inputs on this machine? */
export const inspectImage = async (exec: Exec, tag: string): Promise<ImageState> => {
  const inspect = await exec({
    argv: ["docker", "image", "inspect", "--format", "{{.Size}}", tag],
    timeoutMs: 30_000
  });
  if (inspect.code === 0) {
    return { status: "current", tag, size: Number(inspect.stdout.trim()) || 0 };
  }
  const listing = await exec({
    argv: [
      "docker",
      "image",
      "ls",
      "--filter",
      `reference=${IMAGE_REPOSITORY}`,
      "--format",
      "{{.Repository}}:{{.Tag}}"
    ],
    timeoutMs: 30_000
  });
  if (listing.code !== 0) {
    return {
      status: "unreachable",
      tag,
      detail: (listing.stderr || inspect.stderr).trim().slice(-300)
    };
  }
  const present = listing.stdout.split("\n").filter((line) => line.trim() !== "");
  return present.length > 0 ? { status: "stale", tag, present } : { status: "missing", tag };
};

export interface BuildOptions {
  readonly noCache?: boolean | undefined;
  readonly timeoutMs?: number | undefined;
}

export type BuildResult =
  { readonly ok: true; readonly tag: string } | { readonly ok: false; readonly reason: string };

/**
 * Build the image from a staged context: the Dockerfile and the scripts in a
 * temporary folder. The repository is never the build context, so no repository
 * file can end up in the image.
 */
export const buildImage = async (
  exec: Exec,
  context: ImageContext,
  options: BuildOptions = {}
): Promise<BuildResult> => {
  const directory = await mkdtemp(path.join(tmpdir(), "kaine-desk-image-"));
  try {
    for (const [name, content] of context.files) {
      await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
      await writeFile(path.join(directory, name), content, "utf8");
    }
    const argv = [
      "docker",
      "build",
      "--tag",
      context.tag,
      "--label",
      `${DESK_LABEL}=1`,
      "--label",
      `${LABEL_KIND}=image`,
      "--label",
      `kaine-desk.hash=${context.hash}`,
      "--file",
      path.join(directory, DOCKERFILE),
      ...Object.entries(context.buildArgs).flatMap(([key, value]) => [
        "--build-arg",
        `${key}=${value}`
      ]),
      ...(options.noCache === true ? ["--no-cache"] : []),
      directory
    ];
    const result = await exec({ argv, timeoutMs: options.timeoutMs ?? 30 * 60_000 });
    if (result.code !== 0) {
      const tail = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-15).join("\n");
      return {
        ok: false,
        reason: result.timedOut ? "The image build timed out." : `docker build failed:\n${tail}`
      };
    }
    return { ok: true, tag: context.tag };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
