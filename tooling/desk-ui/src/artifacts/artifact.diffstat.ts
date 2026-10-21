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

/** One line of a patch. `hunk` is the `@@` line; numbers are 1-based, `null` where a side has none. */
export interface DiffLine {
  readonly kind: "hunk" | "add" | "del" | "context";
  readonly text: string;
  readonly oldLine: number | null;
  readonly newLine: number | null;
}

export interface DiffFile extends DiffFileStat {
  readonly lines: readonly DiffLine[];
}

const HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

interface OpenFile {
  path: string;
  added: number;
  removed: number;
  binary: boolean;
  lines: DiffLine[];
}

/**
 * Split a unified diff (`diff.patch`) into files with their lines. Lines carry the numbers of
 * the old and the new file, so a review finding (a new-file line) finds its place. Binary files
 * have no lines.
 */
export function parseDiffFiles(patch: string): DiffFile[] {
  const files: OpenFile[] = [];
  let current: OpenFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    const header = HEADER.exec(line);
    if (header !== null) {
      current = { path: header[2] ?? "", added: 0, removed: 0, binary: false, lines: [] };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (current === null) continue;
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current.lines.push({ kind: "hunk", text: line, oldLine: null, newLine: null });
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.binary = true;
    } else if (!inHunk || line === "" || line.startsWith("\\")) {
      continue;
    } else if (line.startsWith("+")) {
      current.added += 1;
      current.lines.push({ kind: "add", text: line.slice(1), oldLine: null, newLine });
      newLine += 1;
    } else if (line.startsWith("-")) {
      current.removed += 1;
      current.lines.push({ kind: "del", text: line.slice(1), oldLine, newLine: null });
      oldLine += 1;
    } else {
      current.lines.push({ kind: "context", text: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return files;
}

/** Count the files and the changed lines of a unified diff. Binary files count as one file with no lines. */
export function parseDiffStat(patch: string): DiffStat {
  const files = parseDiffFiles(patch).map(({ path, added, removed, binary }): DiffFileStat => ({
    path,
    added,
    removed,
    binary
  }));
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
