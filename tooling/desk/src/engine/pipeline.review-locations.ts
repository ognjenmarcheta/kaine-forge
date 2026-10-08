import type { ReviewFinding } from "../contracts";
import { normalizeRepoPath } from "../policy/protected-paths";

/**
 * Which new-side lines a unified diff shows, per file. A review comment may
 * point only at a line a reader of the diff can see: an added line or a
 * context line. The idea comes from the factory's `reviewLocations`.
 */
export const diffNewLines = (patch: string): Map<string, ReadonlySet<number>> => {
  const lines = new Map<string, Set<number>>();
  let file: string | null = null;
  let line = 0;
  // `+++ ` starts a file header only before the first hunk. In a hunk it is an added line.
  let header = false;
  for (const text of patch.split("\n")) {
    if (text.startsWith("diff --git ")) {
      file = null;
      line = 0;
      header = true;
    } else if (header && text.startsWith("+++ ")) {
      const target = text.slice(4).replace(/\t.*$/, "");
      if (target === "/dev/null") {
        file = null;
      } else {
        const path = target.startsWith("b/") ? target.slice(2) : target;
        file = normalizeRepoPath(path);
        if (file !== null && !lines.has(file)) lines.set(file, new Set());
      }
      line = 0;
    } else if (text.startsWith("@@")) {
      header = false;
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      line = match?.[1] === undefined ? 0 : Number(match[1]);
    } else if (file !== null && line > 0) {
      // `-` lines exist only on the old side; "\ No newline" is not a line.
      if (text.startsWith("+") || text.startsWith(" ")) {
        lines.get(file)?.add(line);
        line += 1;
      }
    }
  }
  return lines;
};

export interface LocatedFindings {
  readonly accepted: readonly ReviewFinding[];
  readonly rejected: readonly { readonly finding: ReviewFinding; readonly reason: string }[];
}

/** Split findings into those that point inside the diff and those that do not. */
export const locateFindings = (
  findings: readonly ReviewFinding[],
  patch: string
): LocatedFindings => {
  const visible = diffNewLines(patch);
  const accepted: ReviewFinding[] = [];
  const rejected: { finding: ReviewFinding; reason: string }[] = [];
  for (const finding of findings) {
    const lines = visible.get(finding.file);
    if (lines === undefined) {
      rejected.push({ finding, reason: `'${finding.file}' is not a changed file in the diff` });
    } else if (!lines.has(finding.line)) {
      rejected.push({
        finding,
        reason: `line ${finding.line} of '${finding.file}' is not inside a changed hunk`
      });
    } else {
      accepted.push(finding);
    }
  }
  return { accepted, rejected };
};
