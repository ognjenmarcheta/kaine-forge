import { afterEach, describe, expect, it } from "vitest";

import type { ReviewFinding } from "../contracts";
import { diffAgainstBase } from "../git";
import { diffNewLines, locateFindings } from "./pipeline.review-locations";
import { createScratch, hermeticExec, type TestScratch } from "../testing/git.repo";

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -3,4 +3,5 @@ function a() {",
  " context three",
  "-removed",
  "+added four",
  "+added five",
  " context six",
  "@@ -20,2 +21,2 @@",
  " context twenty-one",
  "+added twenty-two",
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+one",
  "+++ looks like a header but is an added line",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "deleted file mode 100644",
  "--- a/src/gone.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-bye",
  "-bye",
  ""
].join("\n");

const finding = (over: Partial<ReviewFinding>): ReviewFinding => ({
  severity: "Consider",
  blocking: false,
  file: "src/a.ts",
  line: 4,
  section: "Correctness",
  summary: "s",
  fix: "",
  ...over
});

describe("diffNewLines", () => {
  it("lists added and context lines by their new line number, and skips removed lines", () => {
    const lines = diffNewLines(PATCH);
    expect([...(lines.get("src/a.ts") ?? [])]).toEqual([3, 4, 5, 6, 21, 22]);
  });

  it("counts an added line that looks like a file header", () => {
    expect([...(diffNewLines(PATCH).get("src/new.ts") ?? [])]).toEqual([1, 2]);
  });

  it("knows no lines for a deleted file", () => {
    expect(diffNewLines(PATCH).has("src/gone.ts")).toBe(false);
  });

  it("returns nothing for an empty patch", () => {
    expect(diffNewLines("").size).toBe(0);
  });

  it("ignores unsafe paths", () => {
    const patch = [
      "diff --git a/../x b/../x",
      "--- a/../x",
      "+++ b/../x",
      "@@ -0,0 +1 @@",
      "+x"
    ].join("\n");
    expect(diffNewLines(patch).size).toBe(0);
  });
});

describe("locateFindings", () => {
  it("accepts a finding on an added or context line", () => {
    const result = locateFindings([finding({ line: 4 }), finding({ line: 3 })], PATCH);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toEqual([]);
  });

  it("rejects a line outside every hunk", () => {
    const result = locateFindings([finding({ line: 10 })], PATCH);
    expect(result.rejected).toEqual([
      {
        finding: finding({ line: 10 }),
        reason: "line 10 of 'src/a.ts' is not inside a changed hunk"
      }
    ]);
  });

  it("rejects a file that the diff does not change, a deleted file, and a removed line", () => {
    const result = locateFindings(
      [finding({ file: "src/other.ts" }), finding({ file: "src/gone.ts", line: 1 })],
      PATCH
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      "'src/other.ts' is not a changed file in the diff",
      "'src/gone.ts' is not a changed file in the diff"
    ]);
  });
});

describe("locateFindings against a patch from real git", () => {
  let scratch: TestScratch | null = null;
  afterEach(async () => {
    await scratch?.cleanup();
    scratch = null;
  });

  it("accepts lines in a real hunk and rejects the rest", async () => {
    scratch = await createScratch();
    const repo = await scratch.repo("repo");
    const base = await repo.git(["rev-parse", "HEAD"]);
    await repo.write("src/new.ts", "one\ntwo\nthree\n");
    await repo.write("README.md", "# fixture\nadded line\n");
    const { patch } = await diffAgainstBase(hermeticExec, repo.dir, base);

    const result = locateFindings(
      [
        finding({ file: "src/new.ts", line: 3 }),
        finding({ file: "src/new.ts", line: 4 }),
        finding({ file: "README.md", line: 2 }),
        finding({ file: "README.md", line: 1 })
      ],
      patch
    );
    // README.md line 1 is a context line of the hunk, so it is visible too.
    expect(result.accepted.map((entry) => `${entry.file}:${entry.line}`)).toEqual([
      "src/new.ts:3",
      "README.md:2",
      "README.md:1"
    ]);
    expect(result.rejected.map((entry) => `${entry.finding.file}:${entry.finding.line}`)).toEqual([
      "src/new.ts:4"
    ]);
  });
});
