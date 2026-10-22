import { describe, expect, it } from "vitest";

import { clipLines, parseDiffFiles, parseDiffStat } from "./artifact.diffstat";
import { DIFF_PATCH } from "../../tests/fixture.data";

describe("parseDiffStat", () => {
  it("counts files and changed lines, not the file headers", () => {
    expect(parseDiffStat(DIFF_PATCH)).toEqual({
      files: [
        { path: "apps/web/src/board.tsx", added: 2, removed: 1, binary: false },
        { path: "apps/web/src/board.empty.tsx", added: 2, removed: 0, binary: false }
      ],
      added: 4,
      removed: 1
    });
  });

  it("marks a binary file and counts no lines for it", () => {
    const stat = parseDiffStat(
      "diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n"
    );
    expect(stat.files).toEqual([{ path: "logo.png", added: 0, removed: 0, binary: true }]);
  });

  it("does not count a removed line that starts with dashes as a header", () => {
    const stat = parseDiffStat(
      "diff --git a/a.md b/a.md\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n--- old rule\n+++ new rule\n"
    );
    expect(stat).toMatchObject({ added: 1, removed: 1 });
  });

  it("returns nothing for an empty diff", () => {
    expect(parseDiffStat("")).toEqual({ files: [], added: 0, removed: 0 });
  });
});

describe("parseDiffFiles", () => {
  it("numbers each line on its side, so a finding on a new-file line finds its row", () => {
    const [board] = parseDiffFiles(
      "diff --git a/a.ts b/a.ts\n@@ -10,3 +10,3 @@\n keep\n-old\n+new\n\\ No newline at end of file\n tail\n"
    );
    expect(board?.lines).toEqual([
      { kind: "hunk", text: "@@ -10,3 +10,3 @@", oldLine: null, newLine: null },
      { kind: "context", text: "keep", oldLine: 10, newLine: 10 },
      { kind: "del", text: "old", oldLine: 11, newLine: null },
      { kind: "add", text: "new", oldLine: null, newLine: 11 },
      { kind: "context", text: "tail", oldLine: 12, newLine: 12 }
    ]);
  });
});

describe("clipLines", () => {
  it("cuts a long text and says so", () => {
    expect(clipLines("a\nb\nc", 2)).toEqual({ text: "a\nb", clipped: true });
    expect(clipLines("a\nb", 2)).toEqual({ text: "a\nb", clipped: false });
  });
});
