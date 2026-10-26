import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { applyTemplateAdoption, deriveTemplateAdoptionConfig } from "./template-adoption.util";
import {
  nextTemplateConfig,
  readTemplateConfig,
  renderTemplateConfig,
  TEMPLATE_CONFIG_PATH
} from "./template-sync.util";

const SELF = [".ai/template-sync.ts", ".ai/template-sync.util.ts", ".ai/template-adoption.util.ts"];
const guide = (one: string, three: string): string =>
  `# Kaine Forge AI Guide\n\n## Rules\n\n${one}\n\nRule two.\n\n${three}\n`;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, args: string[], time?: number): string =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Sync Test",
      "-c",
      "user.email=sync@example.test",
      "-c",
      "commit.gpgsign=false",
      ...args
    ],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(time ? { GIT_AUTHOR_DATE: `@${time} +0000`, GIT_COMMITTER_DATE: `@${time} +0000` } : {})
      }
    }
  ).trim();

const writeFiles = (root: string, files: ReadonlyMap<string, string>): void => {
  for (const [path, content] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
};

const commitAll = (root: string, message: string, time: number): string => {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message], time);
  return git(root, ["rev-parse", "HEAD"]);
};

/** An upstream with two commits and a project adopted from the first, with one local edit. */
const createFixture = (localRuleThree: string, options: { record: boolean } = { record: true }) => {
  const root = mkdtempSync(join(tmpdir(), "kaine-sync-"));
  roots.push(root);
  const upstream = join(root, "upstream");
  const project = join(root, "project");
  const adoption = deriveTemplateAdoptionConfig({
    productName: "Acme Ops",
    desktopIdentifier: "com.acme.ops.desktop"
  });

  const v1 = new Map([
    ...SELF.map((path) => [path, readFileSync(join(REPO_ROOT, path), "utf8")] as const),
    [
      ".ai/template-sync.manifest.json",
      JSON.stringify({
        schemaVersion: 1,
        self: SELF,
        paths: [".ai/guide.md", ".ai/skills/", ...SELF]
      })
    ],
    [".ai/guide.md", guide("Rule one.", "Rule three.")],
    [".ai/skills/kaine-open-pr.md", "Use Kaine Forge branch naming.\n"],
    [".ai/skills/kaine-old.md", "Old skill.\n"],
    [".ai/unsynced.md", "Kaine Forge only.\n"]
  ]);
  mkdirSync(upstream);
  git(upstream, ["init", "-q", "-b", "main"]);
  writeFiles(upstream, v1);
  commitAll(upstream, "v1", 1_000);

  // Like GitHub "Use this template": a new root commit with no shared history.
  mkdirSync(project);
  git(project, ["init", "-q", "-b", "main"]);
  writeFiles(project, applyTemplateAdoption(v1, adoption).files);
  const record = nextTemplateConfig(adoption, null);
  writeFiles(
    project,
    new Map([
      // Projects adopted before ai:sync existed have only their adoption config file.
      options.record
        ? [
            TEMPLATE_CONFIG_PATH,
            renderTemplateConfig({ ...record, upstream: { url: upstream, ref: "main" } })
          ]
        : ["template-adoption.json", JSON.stringify(adoption)],
      [
        ".ai/guide.md",
        guide("Rule one, Acme flavour.", localRuleThree).replace("Kaine Forge", "Acme Ops")
      ],
      [".gitignore", "node_modules\n"]
    ])
  );
  symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"));
  commitAll(project, "adopt", 2_000);

  writeFiles(
    upstream,
    new Map([
      [".ai/guide.md", guide("Rule one.", "Rule three, updated.")],
      [".ai/skills/kaine-open-pr.md", "Use Kaine Forge branch naming.\nAlso run checks.\n"],
      [".ai/skills/kaine-new.md", "New skill.\n"],
      // A new sync tool version: it must replace itself first and finish the sync.
      [".ai/template-sync.util.ts", `${v1.get(".ai/template-sync.util.ts")}\n// v2\n`]
    ])
  );
  unlinkSync(join(upstream, ".ai/skills/kaine-old.md"));
  const latest = commitAll(upstream, "v2", 3_000);

  const sync = (...args: string[]) =>
    spawnSync(
      join(REPO_ROOT, "node_modules", ".bin", "tsx"),
      [".ai/template-sync.ts", "--skip-checks", ...args],
      {
        cwd: project,
        encoding: "utf8"
      }
    );
  const read = (path: string): string => readFileSync(join(project, path), "utf8");
  const base = () => readTemplateConfig(join(project, TEMPLATE_CONFIG_PATH))?.base;
  return { project, upstream, latest, sync, read, base };
};

it("refuses a dirty tree, then merges upstream changes into an adopted project", () => {
  const fixture = createFixture("Rule three.");

  writeFileSync(join(fixture.project, ".ai/guide.md"), "uncommitted\n");
  const refused = fixture.sync();
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain(".ai/guide.md");
  expect(fixture.base()).toBeUndefined();
  git(fixture.project, ["checkout", "--", ".ai/guide.md"]);

  const result = fixture.sync();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("Updated the sync tool");
  expect(fixture.read(".ai/template-sync.util.ts").endsWith("// v2\n")).toBe(true);
  expect(fixture.read(".ai/guide.md")).toBe(
    guide("Rule one, Acme flavour.", "Rule three, updated.").replace("Kaine Forge", "Acme Ops")
  );
  expect(fixture.read(".ai/skills/kaine-open-pr.md")).toBe(
    "Use Acme Ops branch naming.\nAlso run checks.\n"
  );
  expect(fixture.read(".ai/skills/kaine-new.md")).toBe("New skill.\n");
  expect(existsSync(join(fixture.project, ".ai/skills/kaine-old.md"))).toBe(false);
  expect(existsSync(join(fixture.project, ".ai/unsynced.md"))).toBe(true);
  expect(fixture.base()).toBe(fixture.latest);
}, 60_000);

it("writes conflict markers and still advances the base when edits overlap", () => {
  const fixture = createFixture("Rule three, local.");

  const result = fixture.sync();
  expect(result.status).toBe(1);
  expect(fixture.read(".ai/guide.md")).toContain(
    "<<<<<<< local\nRule three, local.\n=======\nRule three, updated.\n>>>>>>> upstream\n"
  );
  expect(fixture.base()).toBe(fixture.latest);
}, 60_000);

it("records the adoption config of an older project with --init, then syncs it", () => {
  const fixture = createFixture("Rule three.", { record: false });

  const result = fixture.sync("--init", "template-adoption.json", "--upstream", fixture.upstream);
  expect(result.status, result.stderr).toBe(0);
  expect(fixture.read(".ai/guide.md")).toContain("Rule three, updated.");
  expect(fixture.base()).toBe(fixture.latest);
  expect(readTemplateConfig(join(fixture.project, TEMPLATE_CONFIG_PATH))?.adoption.repoSlug).toBe(
    "acme-ops"
  );
}, 60_000);
