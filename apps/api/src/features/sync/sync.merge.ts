/** A run of base lines `[start, end)` that one side replaced with `lines`. */
interface Hunk {
  start: number;
  end: number;
  lines: string[];
}

/** Larger inputs count as a conflict instead of a slow diff. */
const MAX_DIFF_CELLS = 4_000_000;

/** The runs of `base` that `side` changed, from a longest common subsequence of lines. */
function hunks(base: string[], side: string[]): Hunk[] | null {
  const width = side.length + 1;
  if ((base.length + 1) * width > MAX_DIFF_CELLS) return null;
  // common[i * width + j]: the common subsequence length of base[i..] and side[j..].
  const common = new Uint32Array((base.length + 1) * width);
  for (let i = base.length - 1; i >= 0; i--) {
    for (let j = side.length - 1; j >= 0; j--) {
      common[i * width + j] =
        base[i] === side[j]
          ? (common[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(common[(i + 1) * width + j] ?? 0, common[i * width + j + 1] ?? 0);
    }
  }

  const found: Hunk[] = [];
  let i = 0;
  let j = 0;
  let start = 0;
  let sideStart = 0;
  const flush = (end: number, sideEnd: number) => {
    if (start < end || sideStart < sideEnd) {
      found.push({ start, end, lines: side.slice(sideStart, sideEnd) });
    }
  };
  while (i < base.length || j < side.length) {
    if (i < base.length && j < side.length && base[i] === side[j]) {
      flush(i, j);
      i++;
      j++;
      start = i;
      sideStart = j;
    } else if (
      j < side.length &&
      (i === base.length || (common[i * width + j + 1] ?? 0) >= (common[(i + 1) * width + j] ?? 0))
    ) {
      j++;
    } else {
      i++;
    }
  }
  flush(base.length, side.length);
  return found;
}

/** The base lines `[start, end)` with one side's hunks in that range applied. */
function render(base: string[], start: number, end: number, applied: Hunk[]): string[] {
  const lines: string[] = [];
  let position = start;
  for (const hunk of applied) {
    lines.push(...base.slice(position, hunk.start), ...hunk.lines);
    position = hunk.end;
  }
  lines.push(...base.slice(position, end));
  return lines;
}

/**
 * Merges two edits of the same text line by line: `ours` and `theirs` both
 * started from `base`. Edits to different lines both apply. Returns null when
 * both sides changed the same or adjacent lines in different ways.
 */
export function mergeText(base: string, ours: string, theirs: string): string | null {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;

  const baseLines = base.split("\n");
  const oursHunks = hunks(baseLines, ours.split("\n"));
  const theirsHunks = hunks(baseLines, theirs.split("\n"));
  if (!oursHunks || !theirsHunks) return null;

  const all = [
    ...oursHunks.map((hunk) => ({ ...hunk, ours: true })),
    ...theirsHunks.map((hunk) => ({ ...hunk, ours: false }))
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: string[] = [];
  let position = 0;
  let index = 0;
  while (index < all.length) {
    const first = all[index];
    if (!first) break;
    // One cluster: hunks whose base runs overlap or touch.
    let end = first.end;
    let next = index + 1;
    for (let hunk = all[next]; hunk && hunk.start <= end; hunk = all[next]) {
      end = Math.max(end, hunk.end);
      next++;
    }
    const cluster = all.slice(index, next);
    const fromOurs = render(
      baseLines,
      first.start,
      end,
      cluster.filter((hunk) => hunk.ours)
    );
    const fromTheirs = render(
      baseLines,
      first.start,
      end,
      cluster.filter((hunk) => !hunk.ours)
    );
    const oursOnly = cluster.every((hunk) => hunk.ours);
    const theirsOnly = cluster.every((hunk) => !hunk.ours);
    if (!oursOnly && !theirsOnly && fromOurs.join("\n") !== fromTheirs.join("\n")) return null;

    merged.push(...baseLines.slice(position, first.start), ...(theirsOnly ? fromTheirs : fromOurs));
    position = end;
    index = next;
  }
  merged.push(...baseLines.slice(position));
  return merged.join("\n");
}
