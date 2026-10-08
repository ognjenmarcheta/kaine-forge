import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

import { CHECK_REPORT_FILE } from "../check/check.run";
import { ARTIFACT_IDS, type ArtifactEntry, type ArtifactId } from "../contracts";
import { ARTIFACTS } from "../engine/pipeline.artifacts";
import { PR_BODY_FILE, SHIP_PLAN_FILE } from "../ship/ship.contract";
import type { IssueStore } from "../store/store.issue";

/**
 * The artifacts a client can read. A request names an id from this table and
 * an issue number; the server never takes a path from the client, so there
 * is nothing to traverse. The file names and locations are fixed here.
 */
interface ArtifactSpec {
  readonly file: string;
  readonly contentType: string;
  /** `events.jsonl` sits in the issue directory. The others sit in `artifacts/`. */
  readonly location: "artifacts" | "issue";
}

const MARKDOWN = "text/markdown; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";

export const ARTIFACT_SPECS: Readonly<Record<ArtifactId, ArtifactSpec>> = {
  ticket: { file: ARTIFACTS.ticket, contentType: MARKDOWN, location: "artifacts" },
  plan: { file: ARTIFACTS.plan, contentType: JSON_TYPE, location: "artifacts" },
  build: { file: ARTIFACTS.build, contentType: JSON_TYPE, location: "artifacts" },
  "check-report": { file: CHECK_REPORT_FILE, contentType: JSON_TYPE, location: "artifacts" },
  review: { file: ARTIFACTS.review, contentType: JSON_TYPE, location: "artifacts" },
  diff: { file: ARTIFACTS.diff, contentType: TEXT, location: "artifacts" },
  "pr-body": { file: PR_BODY_FILE, contentType: MARKDOWN, location: "artifacts" },
  "ship-plan": { file: SHIP_PLAN_FILE, contentType: JSON_TYPE, location: "artifacts" },
  log: { file: "events.jsonl", contentType: TEXT, location: "issue" }
};

export const isArtifactId = (value: string): value is ArtifactId =>
  ARTIFACT_IDS.some((id) => id === value);

/** Largest artifact the server reads into memory. A larger one is cut and marked. */
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

export const artifactPath = (store: IssueStore, issueNumber: number, id: ArtifactId): string => {
  const spec = ARTIFACT_SPECS[id];
  const base =
    spec.location === "artifacts" ? store.artifactsDir(issueNumber) : store.issueDir(issueNumber);
  const file = path.join(base, spec.file);
  // The names are constants and the number is validated; this check keeps that true after a change.
  if (path.dirname(file) !== base) throw new Error(`Artifact path escapes its directory: ${id}`);
  return file;
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export type ArtifactRead =
  | { readonly status: "ok"; readonly bytes: Buffer; readonly truncated: boolean }
  | { readonly status: "missing" };

/**
 * Read a whitelisted artifact. A symbolic link or a non-file is "missing":
 * the engine writes plain files, so anything else was put there by someone else.
 */
export const readArtifact = async (
  store: IssueStore,
  issueNumber: number,
  id: ArtifactId,
  maxBytes = MAX_ARTIFACT_BYTES
): Promise<ArtifactRead> => {
  const file = artifactPath(store, issueNumber, id);
  try {
    const info = await lstat(file);
    if (!info.isFile()) return { status: "missing" };
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const size = Math.min(info.size, maxBytes);
      const bytes = Buffer.alloc(size);
      const { bytesRead } = await handle.read(bytes, 0, size, 0);
      return {
        status: "ok",
        bytes: bytes.subarray(0, bytesRead),
        truncated: info.size > maxBytes
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isMissing(error)) return { status: "missing" };
    // ELOOP from O_NOFOLLOW: a link replaced the file after the check.
    if (error instanceof Error && "code" in error && error.code === "ELOOP") {
      return { status: "missing" };
    }
    throw error;
  }
};

/** Which artifacts exist, with size and time. Used by the issue detail. */
export const indexArtifacts = async (
  store: IssueStore,
  issueNumber: number
): Promise<ArtifactEntry[]> =>
  Promise.all(
    ARTIFACT_IDS.map(async (id): Promise<ArtifactEntry> => {
      try {
        const info = await lstat(artifactPath(store, issueNumber, id));
        if (!info.isFile()) return { id, present: false, bytes: null, updatedAt: null };
        return {
          id,
          present: true,
          bytes: info.size,
          updatedAt: info.mtime.toISOString()
        };
      } catch (error) {
        if (isMissing(error)) return { id, present: false, bytes: null, updatedAt: null };
        throw error;
      }
    })
  );
