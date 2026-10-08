import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  changedWorkspaces,
  changesetDecision,
  changesetFileName,
  changesetRelativePath,
  discoverWorkspaces,
  renderChangeset,
  summarizeForChangeset,
  SKIP_CHANGESET_LABEL,
  type WorkspacePackage
} from "./ship.changeset";
import { createScratch } from "../testing/git.repo";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

const workspaces: WorkspacePackage[] = [
  { name: "@repo/desk", dir: "tooling/desk", private: true },
  { name: "@repo/ui", dir: "packages/ui", private: true },
  { name: "@repo/web", dir: "apps/web", private: true }
];

const required = (packages: string[], bump: "patch" | "minor" | "major" = "minor") => ({
  changeset: { required: true, packages, bump }
});
const notRequired = { changeset: { required: false, packages: [], bump: "patch" as const } };

describe("changesetDecision (the ci-pr.yml rule)", () => {
  it.each([
    ["docs only", ["docs/agents/agent-desk.md", "README.md"]],
    ["the AI scaffold only", [".ai/skills/kaine-open-pr.md", ".ai/guide.md"]],
    ["CI only", [".github/workflows/ci-pr.yml"]],
    ["root config only", ["package.json", "knip.json"]],
    ["nothing", []]
  ])("needs nothing for %s", (_name, files) => {
    expect(changesetDecision(files, required(["@repo/desk"]), workspaces).kind).toBe("none");
  });

  it.each(["apps/web/src/a.ts", "packages/ui/src/a.ts", "tooling/desk/src/a.ts", "tooling/x.ts"])(
    "treats %s as source",
    (file) => {
      expect(changesetDecision([file], notRequired, workspaces).kind).toBe("skip-label");
    }
  );

  it("does not treat a path that only contains the word as source", () => {
    expect(
      changesetDecision(["docs/apps/web.md", "xtooling/a.ts"], notRequired, workspaces).kind
    ).toBe("none");
  });

  it("accepts an existing .changeset/*.md, like the workflow", () => {
    const decision = changesetDecision(
      ["tooling/desk/src/a.ts", ".changeset/already.md"],
      required(["@repo/desk"]),
      workspaces
    );
    expect(decision).toMatchObject({ kind: "none", reason: expect.stringContaining("already") });
  });

  it("does not accept a file in a nested .changeset path or a non-md file", () => {
    for (const other of [".changeset/config.json", ".changeset/sub/a.md"]) {
      expect(changesetDecision(["tooling/desk/a.ts", other], notRequired, workspaces).kind).toBe(
        "skip-label"
      );
    }
  });

  it("adds the skip label when the plan marks the change as not releasable", () => {
    expect(changesetDecision(["packages/ui/src/a.ts"], notRequired, workspaces)).toEqual({
      kind: "skip-label",
      label: SKIP_CHANGESET_LABEL,
      reason: expect.any(String)
    });
  });

  it("writes a file with the planned packages and bump", () => {
    const decision = changesetDecision(
      ["tooling/desk/src/a.ts"],
      required(["@repo/desk", "@repo/desk"], "minor"),
      workspaces
    );
    expect(decision).toEqual({
      kind: "file",
      packages: ["@repo/desk"],
      bump: "minor",
      reason: expect.any(String),
      unlisted: []
    });
  });

  it("lists changed packages the plan left out", () => {
    const decision = changesetDecision(
      ["tooling/desk/src/a.ts", "packages/ui/src/b.ts"],
      required(["@repo/desk"], "patch"),
      workspaces
    );
    expect(decision).toMatchObject({ kind: "file", unlisted: ["@repo/ui"] });
  });

  it("refuses a plan that names a package that is not a workspace", () => {
    const decision = changesetDecision(
      ["tooling/desk/src/a.ts"],
      required(["@repo/desk", "@repo/ghost"]),
      workspaces
    );
    expect(decision).toMatchObject({ kind: "invalid", unknown: ["@repo/ghost"] });
  });

  it("does not validate packages when no changeset is needed", () => {
    expect(changesetDecision(["docs/a.md"], required(["@repo/ghost"]), workspaces).kind).toBe(
      "none"
    );
  });
});

describe("the CI workflow is the source of the rule", () => {
  it("still uses the paths, the changeset glob and the label this module replicates", async () => {
    const workflow = await readFile(path.join(REPO_ROOT, ".github/workflows/ci-pr.yml"), "utf8");
    const block = workflow.slice(workflow.indexOf("changeset-required:"));
    for (const fragment of [
      '"apps/**"',
      '"packages/**"',
      '"tooling/**"',
      '".changeset/*.md"',
      "release:skip-changeset"
    ]) {
      expect(block).toContain(fragment);
    }
    expect(SKIP_CHANGESET_LABEL).toBe("release:skip-changeset");
  });
});

describe("changedWorkspaces", () => {
  it("maps each file to the workspace with the longest matching directory", () => {
    const nested: WorkspacePackage[] = [
      ...workspaces,
      { name: "@repo/desk-inner", dir: "tooling/desk/inner", private: true }
    ];
    expect(
      changedWorkspaces(
        ["tooling/desk/src/a.ts", "tooling/desk/inner/b.ts", "README.md", "packages/ui-kit/x.ts"],
        nested
      )
    ).toEqual(["@repo/desk", "@repo/desk-inner"]);
  });
});

describe("discoverWorkspaces", () => {
  it("reads the real repository workspaces", async () => {
    const found = await discoverWorkspaces(REPO_ROOT);
    const names = found.map((workspace) => workspace.name);
    expect(names).toEqual(
      expect.arrayContaining(["@repo/api", "@repo/web", "@repo/ui", "@repo/desk"])
    );
    expect(found.every((workspace) => /^(apps|packages|tooling)\/[^/]+$/.test(workspace.dir))).toBe(
      true
    );
    expect(found.find((workspace) => workspace.name === "@repo/desk")).toMatchObject({
      dir: "tooling/desk",
      private: true
    });
  });

  it("maps real changed paths to the real package names", async () => {
    const found = await discoverWorkspaces(REPO_ROOT);
    expect(
      changedWorkspaces(["tooling/desk/src/ship/ship.run.ts", "packages/ui/src/x.ts"], found)
    ).toEqual(["@repo/desk", "@repo/ui"]);
  });

  it("supports exact and wildcard patterns, comments and ignores other directories", async () => {
    const scratch = await createScratch();
    try {
      const root = scratch.root;
      await writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        [
          "packages:",
          '  - "libs/*"  # all libs',
          "  - tools/one",
          "",
          "catalog:",
          "  zod: ^4"
        ].join("\n")
      );
      for (const [dir, json] of [
        ["libs/a", '{"name":"lib-a"}'],
        ["libs/b", '{"name":"@x/lib-b","private":true}'],
        ["tools/one", '{"name":"tool-one"}'],
        ["tools/two", '{"name":"tool-two"}']
      ] as const) {
        await mkdir(path.join(root, dir), { recursive: true });
        await writeFile(path.join(root, dir, "package.json"), json);
      }
      await mkdir(path.join(root, "libs/no-package"), { recursive: true });
      const found = await discoverWorkspaces(root);
      expect(found).toEqual([
        { name: "lib-a", dir: "libs/a", private: false },
        { name: "@x/lib-b", dir: "libs/b", private: true },
        { name: "tool-one", dir: "tools/one", private: false }
      ]);
    } finally {
      await scratch.cleanup();
    }
  });

  it("rejects a pattern it cannot read instead of guessing", async () => {
    const scratch = await createScratch();
    try {
      await writeFile(path.join(scratch.root, "pnpm-workspace.yaml"), 'packages:\n  - "!libs/x"\n');
      await expect(discoverWorkspaces(scratch.root)).rejects.toThrow(
        /Unsupported workspace pattern/
      );
    } finally {
      await scratch.cleanup();
    }
  });
});

describe("renderChangeset", () => {
  it("writes the frontmatter, the closing line and the summary", () => {
    expect(
      renderChangeset({
        packages: ["@repo/ui", "@repo/desk"],
        bump: "minor",
        summary: "Add the ship library. It opens a draft PR."
      })
    ).toBe(
      [
        "---",
        '"@repo/desk": minor',
        '"@repo/ui": minor',
        "---",
        "",
        "Add the ship library. It opens a draft PR.",
        ""
      ].join("\n")
    );
  });

  it("keeps two sentences, drops the rest and adds a final full stop", () => {
    expect(summarizeForChangeset("One. Two! Three.")).toBe("One. Two!");
    expect(summarizeForChangeset("  No full stop\n here ")).toBe("No full stop here.");
  });

  it("falls back to the first sentence when two are too long", () => {
    const long = `${"word ".repeat(40).trim()}. ${"more ".repeat(40).trim()}.`;
    const summary = summarizeForChangeset(long);
    expect(summary.length).toBeLessThanOrEqual(301);
    expect(summary).not.toContain("more");
  });

  it("rejects an empty summary, no package and a bad package name", () => {
    expect(() => renderChangeset({ packages: [], bump: "patch", summary: "x" })).toThrow();
    expect(() => renderChangeset({ packages: ["@repo/a"], bump: "patch", summary: " " })).toThrow();
    expect(() => renderChangeset({ packages: ['x"y'], bump: "patch", summary: "x" })).toThrow(
      /Invalid package name/
    );
  });
});

describe("changeset file names", () => {
  it("uses the slug", () => {
    expect(changesetFileName("agent-desk-ship")).toBe("agent-desk-ship.md");
    expect(changesetRelativePath("agent-desk-ship")).toBe(".changeset/agent-desk-ship.md");
  });

  it("never collides with README.md or config, even on a case-insensitive disk", () => {
    expect(changesetFileName("readme")).toBe("readme-change.md");
    expect(changesetFileName("config")).toBe("config-change.md");
  });

  it("rejects a name that is not a slug", () => {
    expect(() => changesetFileName("../x")).toThrow(RangeError);
    expect(() => changesetFileName("Upper")).toThrow(RangeError);
  });
});
