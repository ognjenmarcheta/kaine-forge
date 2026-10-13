export interface DiffFileStat {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  readonly binary: boolean;
}

export interface DiffStat {
  readonly files: readonly DiffFileStat[];
  readonly added: number;
  readonly removed: number;
}

const HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

/** Count the files and the changed lines of a unified diff (`diff.patch`). Binary files count as one file with no lines. */
export function parseDiffStat(patch: string): DiffStat {
  const files: { path: string; added: number; removed: number; binary: boolean }[] = [];
  let current: { path: string; added: number; removed: number; binary: boolean } | null = null;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    const header = HEADER.exec(line);
    if (header !== null) {
      current = { path: header[2] ?? "", added: 0, removed: 0, binary: false };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("@@")) {
      inHunk = true;
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
    } else if (inHunk && line.startsWith("+")) {
      current.added += 1;
    } else if (inHunk && line.startsWith("-")) {
      current.removed += 1;
    }
  }
  return {
    files,
    added: files.reduce((sum, file) => sum + file.added, 0),
    removed: files.reduce((sum, file) => sum + file.removed, 0)
  };
}

/** The first `maxLines` lines of a long text, and whether anything was cut. */
export function clipLines(text: string, maxLines: number): { text: string; clipped: boolean } {
  const lines = text.split("\n");
  return lines.length <= maxLines
    ? { text, clipped: false }
    : { text: lines.slice(0, maxLines).join("\n"), clipped: true };
}
