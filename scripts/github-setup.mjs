#!/usr/bin/env node
/**
 * pnpm github:setup — apply `.github/repo-setup.json` to the GitHub repository.
 * Default: dry run. `--apply` makes the changes; `--check` exits 1 while anything differs.
 * Pure Node (no workspace deps) so it runs before `pnpm install` on Windows, macOS, and Linux.
 */
import { spawnSync } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { parseArgs } from "node:util";

import { exitCodeFor, runSetup, SECTIONS } from "./github-setup.util.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

/** @type {import("./github-setup.util.mjs").Run} */
const runGh = (args, input) => {
  // No shell: gh is gh.exe on Windows, and argument arrays avoid every quoting difference.
  const result = spawnSync("gh", args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" },
    maxBuffer: 16 * 1024 * 1024
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
};

const STATUS_TEXT = {
  plan: { ok: "ok", change: "would change", manual: "manual", warn: "warn", fail: "FAIL" },
  apply: { ok: "ok", change: "changed", manual: "manual", warn: "warn", fail: "FAIL" }
};

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      apply: { type: "boolean", default: false },
      check: { type: "boolean", default: false },
      only: { type: "string" },
      repo: { type: "string" },
      help: { type: "boolean", default: false }
    },
    strict: true
  });
  if (values.help) {
    console.log(
      [
        "Usage: pnpm github:setup [--apply | --check] [--only <sections>] [--repo <owner/name>]",
        "",
        "Applies .github/repo-setup.json to the GitHub repository with the gh CLI.",
        "  (default)  dry run: show what would change",
        "  --apply    make the changes (needs repository admin rights)",
        "  --check    exit 1 while anything differs or waits for a manual step",
        `  --only     comma-separated sections: ${SECTIONS.join(",")}`,
        "  --repo     owner/name; default is the repository of this checkout"
      ].join("\n")
    );
    return;
  }
  if (values.apply && values.check) throw new Error("Use --apply or --check, not both.");
  const mode = values.apply ? "apply" : values.check ? "check" : "plan";

  const { repo, results } = runSetup({
    manifest: readJson(".github/repo-setup.json"),
    readJson,
    run: runGh,
    repo: values.repo,
    apply: mode === "apply",
    only: values.only?.split(",").map((section) => section.trim())
  });

  console.log(`[github:setup] ${repo} (${mode === "plan" ? "dry run" : mode})`);
  const text = STATUS_TEXT[mode === "apply" ? "apply" : "plan"];
  for (const result of results) {
    console.log(`[github:setup] ${text[result.status]} ${result.section}`);
    for (const line of result.lines) console.log(`    ${line}`);
  }
  if (mode === "plan" && results.some((result) => result.status === "change")) {
    console.log("\nDry run only. Re-run with --apply to make these changes.");
  }
  process.exitCode = exitCodeFor(results, mode);
}

if (import.meta.url === pathToFileURL(resolvePath(process.argv[1] ?? "")).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
