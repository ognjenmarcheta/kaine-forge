import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

type SnapshotEntry = { file: string; mode: number } & (
  { type: "file"; content: Buffer } | { type: "symlink"; target: string }
);

function safePath(root: string, file: string) {
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("Unsafe snapshot root: use a regular checkout directory");
  const parts = file.split(/[\\/]/);
  if (
    path.isAbsolute(file) ||
    path.win32.isAbsolute(file) ||
    parts.some((part) => !part || part === ".." || part === ".")
  )
    throw new Error(`Unsafe snapshot path: ${file}`);
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    const stat = lstatSync(parent, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new Error(`Unsafe snapshot ancestor: ${file}`);
  }
  return path.join(root, ...parts);
}

export function collectSnapshot(root: string, files: string[]) {
  const entries: SnapshotEntry[] = [...new Set(files)].sort().map((file) => {
    const source = safePath(root, file);
    const stat = lstatSync(source, { throwIfNoEntry: false });
    if (!stat) throw new Error(`Commit or restore deleted tracked file before preparing: ${file}`);
    const mode = stat.mode & 0o7777;
    if (stat.isSymbolicLink()) return { file, mode, type: "symlink", target: readlinkSync(source) };
    if (stat.isFile()) return { file, mode, type: "file", content: readFileSync(source) };
    throw new Error(`Unsupported snapshot entry: ${file}`);
  });
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(JSON.stringify([entry.file, entry.type, entry.mode])).update("\0");
    hash.update(entry.type === "file" ? entry.content : entry.target).update("\0");
  }
  return { entries, hash: hash.digest("hex") };
}

export function applySnapshot(root: string, entries: SnapshotEntry[]) {
  // Validate the whole batch before changing the checkout.
  for (const entry of entries) {
    safePath(root, entry.file);
    if (
      entries.some(
        (parent) =>
          parent.type === "symlink" &&
          entry.file.replaceAll("\\", "/").startsWith(`${parent.file.replaceAll("\\", "/")}/`)
      )
    )
      throw new Error(`Unsafe snapshot ancestor: ${entry.file}`);
  }
  for (const entry of entries) {
    const target = safePath(root, entry.file);
    mkdirSync(path.dirname(target), { recursive: true });
    const old = lstatSync(target, { throwIfNoEntry: false });
    if (old) {
      if (!old.isFile() && !old.isSymbolicLink())
        throw new Error(`Unsupported snapshot destination: ${entry.file}`);
      unlinkSync(target);
    }
    try {
      if (entry.type === "symlink") symlinkSync(entry.target, target);
      else {
        writeFileSync(target, entry.content, { mode: entry.mode });
        chmodSync(target, entry.mode);
      }
      const reproduced = lstatSync(target);
      if ((reproduced.mode & 0o7777) !== entry.mode)
        throw new Error("Host filesystem did not preserve the entry mode");
    } catch (error) {
      throw new Error(
        `Cannot reproduce snapshot entry ${entry.file}; check filesystem permissions and symbolic-link support`,
        { cause: error }
      );
    }
  }
}
