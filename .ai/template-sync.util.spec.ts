import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import { deriveTemplateAdoptionConfig } from "./template-adoption.util";
import {
  guessBase,
  type MergeText,
  nextTemplateConfig,
  parseSyncManifest,
  parseTemplateConfig,
  planSync,
  renderTemplateConfig,
  SYNC_MANIFEST_PATH,
  TEMPLATE_UPSTREAM_URL
} from "./template-sync.util";

const adoption = deriveTemplateAdoptionConfig({
  productName: "Acme Ops",
  desktopIdentifier: "com.acme.ops.desktop"
});
const base = "a".repeat(40);

describe("template config", () => {
  it("keeps the recorded upstream and sync base when adoption runs again", () => {
    const first = nextTemplateConfig(adoption, null);
    expect(first.upstream).toEqual({ url: TEMPLATE_UPSTREAM_URL, ref: "main" });

    const synced = {
      ...first,
      upstream: { url: "https://example.test/fork.git", ref: "v2" },
      base
    };
    const renamed = deriveTemplateAdoptionConfig({
      productName: "Acme Platform",
      desktopIdentifier: adoption.desktopIdentifier
    });
    const again = parseTemplateConfig(
      JSON.parse(renderTemplateConfig(nextTemplateConfig(renamed, synced)))
    );

    expect(again).toEqual({ ...synced, adoption: renamed });
  });

  it("rejects a base that is not a full commit SHA", () => {
    const record = JSON.parse(renderTemplateConfig(nextTemplateConfig(adoption, null)));
    expect(() => parseTemplateConfig({ ...record, base: "main" })).toThrow();
  });
});

describe("planSync", () => {
  const guide = ".ai/guide.md";
  const merge: MergeText = (local, _base, upstream) => ({
    content: `${local}|${upstream}`,
    conflict: local.includes("clash")
  });
  const plan = (files: {
    base?: Record<string, string>;
    target?: Record<string, string>;
    local?: Record<string, string>;
  }) =>
    planSync({
      base: new Map(Object.entries(files.base ?? {})),
      target: new Map(Object.entries(files.target ?? {})),
      local: new Map(Object.entries(files.local ?? {})),
      paths: [".ai/guide.md", ".ai/skills/", ".ai/project/"],
      adoption,
      merge
    });

  it("applies an upstream change to a renamed but otherwise untouched file", () => {
    // Without the rename on both upstream sides, every adopted file would look locally edited.
    expect(
      plan({
        base: { [guide]: "# Kaine Forge\nRule.\n" },
        target: { [guide]: "# Kaine Forge\nRule.\nNew rule.\n" },
        local: { [guide]: "# Acme Ops\nRule.\n" }
      })
    ).toEqual([{ path: guide, outcome: "updated", content: "# Acme Ops\nRule.\nNew rule.\n" }]);
  });

  it("merges local edits and reports overlapping ones as conflicts", () => {
    const base = { [guide]: "a", ".ai/skills/kaine-x.md": "a" };
    const target = { [guide]: "b", ".ai/skills/kaine-x.md": "b" };
    const local = { [guide]: "mine", ".ai/skills/kaine-x.md": "clash" };
    expect(plan({ base, target, local }).map(({ path, outcome }) => [path, outcome])).toEqual([
      [".ai/guide.md", "merged"],
      [".ai/skills/kaine-x.md", "conflict"]
    ]);
  });

  it("adds new upstream files and deletes removed ones only when unedited", () => {
    const changes = plan({
      base: { ".ai/skills/kaine-old.md": "old", ".ai/skills/kaine-kept.md": "old" },
      target: { ".ai/skills/kaine-new.md": "new" },
      local: { ".ai/skills/kaine-old.md": "old", ".ai/skills/kaine-kept.md": "edited" }
    });
    expect(changes.map(({ path, outcome, content }) => [path, outcome, content])).toEqual([
      [".ai/skills/kaine-kept.md", "skipped", undefined],
      [".ai/skills/kaine-new.md", "added", "new"],
      [".ai/skills/kaine-old.md", "deleted", null]
    ]);
  });

  it("never writes project-owned files or files outside the manifest", () => {
    expect(
      plan({
        target: { ".ai/project/guide.md": "upstream", ".ai/release-apps.ts": "upstream" },
        local: { ".ai/project/guide.md": "mine" }
      })
    ).toEqual([]);
  });
});

describe("guessBase", () => {
  const upstream = [
    { sha: "c3", tree: "t3", committedAt: 300 },
    { sha: "c2", tree: "t2", committedAt: 200 },
    { sha: "c1", tree: "t1", committedAt: 100 }
  ];

  it("prefers shared history, then a matching root tree", () => {
    const localRoot = { tree: "t2", committedAt: 250 };
    expect(guessBase({ mergeBase: "c1", upstream, localRoot })?.method).toBe("merge-base");
    expect(guessBase({ mergeBase: null, upstream, localRoot })).toEqual({
      sha: "c2",
      method: "tree"
    });
  });

  it("falls back to the last upstream commit not newer than the project's first commit", () => {
    // A base that is too new would treat older upstream changes as already applied.
    const localRoot = { tree: "adopted", committedAt: 250 };
    expect(guessBase({ mergeBase: null, upstream, localRoot })).toEqual({
      sha: "c2",
      method: "date"
    });
    expect(
      guessBase({ mergeBase: null, upstream, localRoot: { tree: "x", committedAt: 50 } })
    ).toBe(null);
  });
});

it("lists only existing files in the upstream sync manifest", () => {
  // A mistyped entry would silently stop syncing that file for every adopter.
  const manifest = parseSyncManifest(
    JSON.parse(readFileSync(join(REPO_ROOT, SYNC_MANIFEST_PATH), "utf8"))
  );
  expect(manifest.paths.filter((path) => !existsSync(join(REPO_ROOT, path)))).toEqual([]);
});
