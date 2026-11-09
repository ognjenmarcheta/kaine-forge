import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = import.meta.dirname;
const workspaceParents = new Set(["apps", "packages", "tooling"]);

/**
 * ESLint reads `eslint-suppressions.json` from its working directory, and each
 * workspace keeps its own baseline. Lint staged files from their workspace so the
 * same baseline applies on commit as in `pnpm lint`.
 */
function eslintCommands(files) {
  const byDirectory = new Map();
  for (const file of files) {
    const [parent, name] = relative(root, file).split(sep);
    const workspace = join(parent, name ?? "");
    const directory =
      workspaceParents.has(parent) && existsSync(join(root, workspace, "package.json"))
        ? workspace
        : ".";
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
  }
  return [...byDirectory].map(([directory, group]) => {
    const quoted = group.map((file) => JSON.stringify(file)).join(" ");
    return directory === "."
      ? `eslint --fix ${quoted}`
      : `pnpm -C ${directory} exec eslint --fix ${quoted}`;
  });
}

export default {
  "*.{js,mjs,cjs,ts,tsx,json,md,css,yml,yaml}": "prettier --write",
  "*.{js,mjs,cjs,ts,tsx}": eslintCommands
};
