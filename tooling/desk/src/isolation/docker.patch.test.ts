import { readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { applyPatch, guardPatch, parseNumstat, parseSummary } from "./docker.patch";
import { createScratch, hermeticExec, type TestRepo, type TestScratch } from "../testing/git.repo";

let scratch: TestScratch | null = null;
afterEach(async () => {
  await scratch?.cleanup();
  scratch = null;
});

const OPTIONS = { maxBytes: 1024 * 1024 };

/** The patch that `change` makes in a repo, as `git diff --binary` prints it. The repo is reset after. */
const patchOf = async (repo: TestRepo, change: () => Promise<void>): Promise<string> => {
  await change();
  await repo.git(["add", "-A"]);
  const patch = await hermeticExec({
    argv: ["git", "diff", "--cached", "--binary", "--full-index", "HEAD"],
    cwd: repo.dir
  });
  await repo.git(["reset", "--quiet", "--hard"]);
  await repo.git(["clean", "--quiet", "-fd"]);
  return patch.stdout;
};

const open = async () => {
  scratch = await createScratch();
  const repo = await scratch.repo("host");
  await repo.write("src/a.ts", "export const a = 1;\n");
  await repo.write("bin/data.bin", Buffer.from([0, 1, 2, 3, 255, 254]));
  await repo.commit("files");
  return repo;
};

describe("guardPatch", () => {
  it("accepts an ordinary text change and a binary change, and lists the files", async () => {
    const repo = await open();
    const patch = await patchOf(repo, async () => {
      await repo.write("src/a.ts", "export const a = 2;\n");
      await repo.write("src/new.ts", "export const n = 1;\n");
      await repo.write("bin/data.bin", Buffer.from([9, 8, 7, 0, 255]));
    });
    expect(patch).toContain("GIT binary patch");
    const verdict = await guardPatch(hermeticExec, repo.dir, patch, OPTIONS);
    expect(verdict).toMatchObject({ ok: true, files: ["bin/data.bin", "src/a.ts", "src/new.ts"] });
  });

  it("accepts an empty patch", async () => {
    const repo = await open();
    expect(await guardPatch(hermeticExec, repo.dir, "", OPTIONS)).toEqual({
      ok: true,
      files: [],
      bytes: 0
    });
  });

  it.each([
    [".husky/pre-commit", "evil\n"],
    [".github/workflows/ci.yml", "on: push\n"],
    [".claude/settings.json", "{}\n"],
    [".agents/skills/x/SKILL.md", "x\n"],
    [".env", "SECRET=1\n"],
    [".ai/hooks/pre-tool-use.mjs", "evil\n"],
    ["node_modules/x/index.js", "evil\n"],
    [".mcp.json", "{}\n"]
  ])("refuses a change to the protected path %s", async (file, content) => {
    const repo = await open();
    const patch = await patchOf(repo, () => repo.write(file, content));
    const verdict = await guardPatch(hermeticExec, repo.dir, patch, OPTIONS);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? [] : verdict.reasons.join(" ")).toMatch(/Protected path/);
  });

  // `git add -A` never stages a .git folder, so a hostile container has to write the patch by hand.
  const newFilePatch = (file: string): string =>
    [
      `diff --git a/${file} b/${file}`,
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      `+++ b/${file}`,
      "@@ -0,0 +1 @@",
      "+[core]",
      ""
    ].join("\n");

  it.each([".git/config", ".git/hooks/pre-commit", "pkg/.git/config", ".GIT/config"])(
    "refuses a hand-written patch for %s",
    async (file) => {
      const repo = await open();
      const verdict = await guardPatch(hermeticExec, repo.dir, newFilePatch(file), OPTIONS);
      expect(verdict.ok).toBe(false);
      expect(verdict.ok ? "" : verdict.reasons.join(" ")).toMatch(/Protected path/);
    }
  );

  it("refuses a hand-written patch that reaches out of the repository", async () => {
    const repo = await open();
    const verdict = await guardPatch(hermeticExec, repo.dir, newFilePatch("../outside"), OPTIONS);
    expect(verdict.ok).toBe(false);
  });

  it("refuses a rename into a protected path", async () => {
    const repo = await open();
    const patch = await patchOf(repo, async () => {
      await repo.git(["mv", "src/a.ts", ".husky/pre-push"]).catch(async () => {
        await repo.write(".husky/pre-push", "x\n");
        await repo.git(["rm", "--quiet", "-f", "src/a.ts"]);
      });
    });
    expect(await guardPatch(hermeticExec, repo.dir, patch, OPTIONS)).toMatchObject({ ok: false });
  });

  it("refuses a symbolic link, because it can point outside the worktree", async () => {
    const repo = await open();
    const patch = await patchOf(repo, async () => {
      await symlink("/etc/passwd", path.join(repo.dir, "src", "link"));
    });
    expect(patch).toContain("120000");
    const verdict = await guardPatch(hermeticExec, repo.dir, patch, OPTIONS);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reasons.join(" ")).toContain("symbolic link");
  });

  it("refuses a patch above the size limit before it reads it", async () => {
    const repo = await open();
    const patch = await patchOf(repo, () => repo.write("src/big.txt", "x".repeat(5000)));
    const verdict = await guardPatch(hermeticExec, repo.dir, patch, { maxBytes: 1000 });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reasons.join(" ")).toContain("limit is 1000");
  });

  it("refuses a patch that touches too many files", async () => {
    const repo = await open();
    const patch = await patchOf(repo, async () => {
      for (let index = 0; index < 5; index += 1) await repo.write(`src/f${index}.ts`, `${index}\n`);
    });
    const verdict = await guardPatch(hermeticExec, repo.dir, patch, { ...OPTIONS, maxFiles: 3 });
    expect(verdict.ok ? "" : verdict.reasons.join(" ")).toContain("5 files");
  });

  it.each([
    ["plain text", "hello world\n"],
    [
      "a unified diff without a git header",
      "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n"
    ],
    ["a NUL byte", "diff --git a/x b/x\0\n"]
  ])("refuses %s", async (_name, patch) => {
    const repo = await open();
    expect(await guardPatch(hermeticExec, repo.dir, patch, OPTIONS)).toMatchObject({ ok: false });
  });

  it("refuses a patch that Git cannot read, with the reason", async () => {
    const repo = await open();
    const verdict = await guardPatch(
      hermeticExec,
      repo.dir,
      "diff --git a/x b/x\nindex 123..456 100644\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n only one line\n",
      OPTIONS
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reasons.join(" ")).toContain("corrupt patch");
  });
});

describe("applyPatch", () => {
  it("applies text and binary changes to the worktree", async () => {
    const repo = await open();
    const patch = await patchOf(repo, async () => {
      await repo.write("src/a.ts", "export const a = 2;\n");
      await repo.write("bin/data.bin", Buffer.from([9, 8, 7, 0, 255]));
    });
    await applyPatch(hermeticExec, repo.dir, patch);
    expect(await readFile(path.join(repo.dir, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
    expect([...(await readFile(path.join(repo.dir, "bin/data.bin")))]).toEqual([9, 8, 7, 0, 255]);
  });

  it("changes nothing when the patch does not apply", async () => {
    const repo = await open();
    const patch = await patchOf(repo, () => repo.write("src/a.ts", "export const a = 2;\n"));
    await repo.write("src/a.ts", "export const a = 99;\n");
    await expect(applyPatch(hermeticExec, repo.dir, patch)).rejects.toThrow(/does not apply/);
    expect(await readFile(path.join(repo.dir, "src/a.ts"), "utf8")).toBe("export const a = 99;\n");
  });

  it("does nothing for an empty patch", async () => {
    const repo = await open();
    await expect(applyPatch(hermeticExec, repo.dir, "")).resolves.toBeUndefined();
  });
});

describe("parsers", () => {
  it("reads paths from numstat output, including a rename", () => {
    expect(parseNumstat("1\t2\tsrc/a.ts\0-\t-\tbin/x\0")).toEqual(["src/a.ts", "bin/x"]);
    expect(parseNumstat("0\t0\t\0old.ts\0new.ts\0")).toEqual(["old.ts", "new.ts"]);
    expect(() => parseNumstat("garbage\0")).toThrow();
    expect(() => parseNumstat("0\t0\t\0old.ts\0")).toThrow(/Truncated/);
  });

  it("reads modes and paths from a summary", () => {
    expect(
      parseSummary(
        " create mode 120000 src/link\n delete mode 100644 old\n mode change 100644 => 100755 run.sh\n rename a => b (100%)\n"
      )
    ).toEqual({
      modes: ["120000", "100644", "100644", "100755"],
      paths: ["src/link", "old", "run.sh"]
    });
  });
});
