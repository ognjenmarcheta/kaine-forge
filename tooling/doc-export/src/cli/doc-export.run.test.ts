import JSZip from "jszip";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runCli } from "./doc-export.run";

const MARKDOWN = `# Quarterly Plan

Where the work stands.

## Goals

- Ship the **export** tool
- Keep \`pnpm check\` green

1. Draft
2. Review
`;

/** Stands for the absolute path of a Markdown file outside the repository. */
const OUTSIDE_SECRET = "<outside>/secret.md";

let base: string;
let repo: string;
let outside: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "doc-export-"));
  repo = path.join(base, "repo");
  outside = path.join(base, "outside");
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(repo, "docs", "plan.md"), MARKDOWN);
  await writeFile(path.join(repo, "docs", "notes.txt"), MARKDOWN);
  await writeFile(path.join(outside, "secret.md"), MARKDOWN);
  // A junction needs no extra rights on Windows; elsewhere it is an ordinary directory symlink.
  await symlink(outside, path.join(repo, "linked"), "junction");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const run = async (...argv: string[]) => {
  let out = "";
  let err = "";
  const code = await runCli(argv, {
    repoRoot: repo,
    cwd: repo,
    out: (text) => {
      out += text;
    },
    err: (text) => {
      err += text;
    }
  });
  return { code, out, err };
};

/** The text of an XML part, tags removed. */
const partText = async (file: string, part: string): Promise<string> => {
  const zip = await JSZip.loadAsync(await readFile(path.join(repo, file)));
  const xml = await zip.file(part)?.async("string");
  if (xml === undefined) throw new Error(`${file} has no ${part}`);
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
};

describe("doc-export", () => {
  it("writes a Word document with the title, headings and list text that --verify accepts", async () => {
    expect(await run("docs/plan.md", "--to", "docx", "--out", "out/word/plan.docx")).toEqual({
      code: 0,
      out: "wrote out/word/plan.docx\n",
      err: ""
    });

    const body = await partText("out/word/plan.docx", "word/document.xml");
    for (const text of ["Quarterly Plan", "Goals", "Ship the", "export", "pnpm check", "Review"]) {
      expect(body).toContain(text);
    }
    const core = await partText("out/word/plan.docx", "docProps/core.xml");
    expect(core).toContain("Quarterly Plan");
    expect(core).toContain("Kaine Forge");

    const verified = await run("--verify", "out/word/plan.docx");
    expect(verified.code).toBe(0);
    expect(verified.out).toMatch(/^ok {3}out\/word\/plan\.docx \(docx, \d+ parts\)\n$/);
  });

  it("writes a 16:9 deck: a title slide with its subtitle, then one slide per ## heading", async () => {
    expect((await run("docs/plan.md", "--to", "pptx", "--out", "out/plan.pptx")).code).toBe(0);

    const cover = await partText("out/plan.pptx", "ppt/slides/slide1.xml");
    expect(cover).toContain("Quarterly Plan");
    expect(cover).toContain("Where the work stands.");
    const goals = await partText("out/plan.pptx", "ppt/slides/slide2.xml");
    for (const text of ["Goals", "Ship the", "export", "pnpm check", "Draft", "Review"]) {
      expect(goals).toContain(text);
    }
    const zip = await JSZip.loadAsync(await readFile(path.join(repo, "out/plan.pptx")));
    expect(zip.file("ppt/slides/slide3.xml")).toBeNull();
    expect(await zip.file("ppt/presentation.xml")?.async("string")).toContain(
      'cx="9144000" cy="5143500"'
    );
    expect((await run("--verify", "out/plan.pptx")).code).toBe(0);
  });

  it.each(["docx", "pptx"])(
    "gives the same %s bytes for the same input at another time",
    async (kind) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
      await run("docs/plan.md", "--to", kind, "--out", `same/a.${kind}`);
      vi.setSystemTime(new Date("2031-06-07T08:09:10Z"));
      await run("docs/plan.md", "--to", kind, "--out", `same/b.${kind}`);

      const first = await readFile(path.join(repo, `same/a.${kind}`));
      expect(first.length).toBeGreaterThan(0);
      expect(first.equals(await readFile(path.join(repo, `same/b.${kind}`)))).toBe(true);
    }
  );

  it.each([
    [
      "an input outside the repository",
      [OUTSIDE_SECRET, "--to", "docx", "--out", "o.docx"],
      /outside the repository/
    ],
    [
      "an input that climbs out with ..",
      ["../outside/secret.md", "--to", "docx", "--out", "o.docx"],
      /outside the repository/
    ],
    [
      "an input through a link that points outside",
      ["linked/secret.md", "--to", "docx", "--out", "o.docx"],
      /outside the repository/
    ],
    [
      "an input that is not Markdown",
      ["docs/notes.txt", "--to", "docx", "--out", "o.docx"],
      /not a Markdown/
    ],
    [
      "an output outside the repository",
      ["docs/plan.md", "--to", "docx", "--out", "../outside/o.docx"],
      /outside the repository/
    ],
    [
      "an output through a link that points outside",
      ["docs/plan.md", "--to", "docx", "--out", "linked/o.docx"],
      /outside the repository/
    ],
    [
      "an output in a dot-directory",
      ["docs/plan.md", "--to", "docx", "--out", ".github/o.docx"],
      /dot-directory/
    ],
    [
      "an output deep in a dot-directory",
      ["docs/plan.md", "--to", "pptx", "--out", "docs/.desk/x/o.pptx"],
      /dot-directory/
    ],
    [
      "an output in node_modules",
      ["docs/plan.md", "--to", "docx", "--out", "node_modules/o.docx"],
      /node_modules/
    ],
    [
      "an output whose extension does not match --to",
      ["docs/plan.md", "--to", "pptx", "--out", "o.docx"],
      /must end in \.pptx/
    ]
  ])("refuses %s and writes nothing", async (_name, given, reason) => {
    const argv = given.map((arg) =>
      arg === OUTSIDE_SECRET ? path.join(outside, "secret.md") : arg
    );
    const result = await run(...argv);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^Refused: /);
    expect(result.err).toMatch(reason);
    expect(result.out).toBe("");
    const output = argv[argv.indexOf("--out") + 1] ?? "";
    expect(existsSync(path.resolve(repo, output))).toBe(false);
  });

  it.each([
    [["docs/plan.md", "--out", "o.docx"], /--to must be one of: docx, pptx/],
    [["docs/plan.md", "--to", "pdf", "--out", "o.pdf"], /--to must be one of/],
    [["docs/plan.md", "--to", "docx"], /--out is required/],
    [["--verify"], /--verify needs at least one path/],
    [["--bogus"], /Unknown option/]
  ])("exits 2 with the usage for %j", async (argv, message) => {
    const result = await run(...argv);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(message);
    expect(result.err).toContain("Usage:");
  });

  it("--verify fails each broken file with a reason and still reports the good ones", async () => {
    await mkdir(path.join(repo, "check", "nested"), { recursive: true });
    await writeFile(path.join(repo, "check", "renamed.docx"), "just text, not a document\n");
    await writeFile(path.join(repo, "check", "binary.pptx"), Buffer.from([0, 1, 2, 3, 255, 254]));
    const partial = new JSZip();
    partial.file("[Content_Types].xml", "<Types/>");
    partial.file("_rels/.rels", "<Relationships/>");
    await writeFile(
      path.join(repo, "check", "nested", "partial.docx"),
      await partial.generateAsync({ type: "nodebuffer" })
    );
    partial.file("ppt/presentation.xml", "<p:presentation/>");
    await writeFile(
      path.join(repo, "check", "nested", "slideless.pptx"),
      await partial.generateAsync({ type: "nodebuffer" })
    );
    await run("docs/plan.md", "--to", "docx", "--out", "check/good.docx");

    const result = await run("--verify", "check");
    expect(result.code).toBe(1);
    expect(result.out.split("\n").filter((line) => line !== "")).toEqual([
      "FAIL check/binary.pptx: not a ZIP archive",
      expect.stringMatching(/^ok {3}check\/good\.docx \(docx, \d+ parts\)$/),
      "FAIL check/nested/partial.docx: missing word/document.xml",
      "FAIL check/nested/slideless.pptx: missing ppt/slides/slide1.xml (no slide)",
      "FAIL check/renamed.docx: not a ZIP archive"
    ]);
  });

  it("--verify fails a path that does not exist and a folder without exports", async () => {
    await mkdir(path.join(repo, "empty"), { recursive: true });
    expect(await run("--verify", "missing.docx")).toMatchObject({
      code: 1,
      out: "FAIL missing.docx: does not exist\n"
    });
    expect(await run("--verify", "empty")).toMatchObject({
      code: 1,
      out: "FAIL no .docx or .pptx files found in empty\n"
    });
  });
});
