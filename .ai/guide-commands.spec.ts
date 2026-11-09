import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";

import { AI_DIR, REPO_ROOT } from "./ai.util";

const manifestSchema = z.object({
  name: z.string().optional(),
  scripts: z.record(z.string(), z.string()).default({})
});

const readManifest = (path: string) => manifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));

// pnpm runs these itself; they are never package.json scripts.
const PNPM_BUILT_INS = new Set(["install"]);

it("names only root and workspace scripts that exist in the guide's Common Commands", () => {
  const guide = readFileSync(join(AI_DIR, "guide.md"), "utf8");
  const section = /^## Common Commands\n([\s\S]*?)(?=^## )/m.exec(guide)?.[1] ?? "";
  const commands = [...section.matchAll(/`(pnpm [^`]+)`/g)].map((match) => match[1] ?? "");
  expect(commands.length, "no `pnpm ...` commands found under ## Common Commands").toBeGreaterThan(
    0
  );

  const rootScripts = readManifest(join(REPO_ROOT, "package.json")).scripts;
  const workspaceScripts = new Map<string, Record<string, string>>();
  for (const group of ["apps", "packages", "tooling"]) {
    for (const dir of readdirSync(join(REPO_ROOT, group))) {
      const manifestPath = join(REPO_ROOT, group, dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = readManifest(manifestPath);
      if (manifest.name) workspaceScripts.set(manifest.name, manifest.scripts);
    }
  }

  const unknown = commands.filter((command) => {
    const [, first = "", second = "", third = ""] = command.split(/\s+/);
    if (first === "--filter") return !Object.hasOwn(workspaceScripts.get(second) ?? {}, third);
    const script = first === "run" ? second : first;
    return !PNPM_BUILT_INS.has(script) && !Object.hasOwn(rootScripts, script);
  });

  expect(unknown).toEqual([]);
});
