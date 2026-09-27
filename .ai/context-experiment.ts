import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverSkills, readGuideSource, renderAgentDoc, REPO_ROOT } from "./ai.util";
import { applySnapshot, collectSnapshot } from "./context-snapshot.util";
import { fingerprintInstructions } from "./run-fingerprint.util";

export function reducedGuide(source: string) {
  return source
    .replace(
      "- Read `MONOREPO_GUIDE.md` before generating, modifying, or reviewing code.",
      "- Use `MONOREPO_GUIDE.md` for architecture, package boundaries, code generation, and engineering conventions relevant to the task."
    )
    .replace(
      /A spawned subagent does receive this guide[^\n]+\n/,
      "Context loading depends on the harness and version. See `docs/agents/harness-evals.md` for measured behavior. Carry the relevant rules into dispatch prompts:\n"
    );
}

export function prepareContextExperiment() {
  const directory = path.join(REPO_ROOT, ".ai.local/context-experiments", randomUUID());
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  }).trim();
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO_ROOT, encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
  const snapshot = collectSnapshot(REPO_ROOT, files);
  for (const file of [".ai/guide.md", "AGENTS.md"]) {
    if (snapshot.entries.find((entry) => entry.file === file)?.type !== "file")
      throw new Error(`Context experiment requires a regular instruction file: ${file}`);
  }
  const source = readGuideSource();
  const candidate = reducedGuide(source);
  if (source === candidate)
    throw new Error("Context experiment anchors changed; review the candidate");
  mkdirSync(directory, { recursive: true });
  const arms = [];
  for (const arm of ["baseline", "candidate"]) {
    const checkout = path.join(directory, arm);
    execFileSync("git", ["clone", "--local", "--no-hardlinks", REPO_ROOT, checkout], {
      stdio: "pipe"
    });
    execFileSync("git", ["checkout", "--detach", revision], { cwd: checkout, stdio: "pipe" });
    applySnapshot(checkout, snapshot.entries);
    const guide = arm === "candidate" ? candidate : source;
    writeFileSync(path.join(checkout, ".ai/guide.md"), guide);
    writeFileSync(path.join(checkout, "AGENTS.md"), renderAgentDoc(guide, discoverSkills()));
    arms.push({
      arm,
      checkout,
      instructionHash: fingerprintInstructions(checkout),
      words: guide.trim().split(/\s+/u).length
    });
  }
  const manifest = {
    schemaVersion: 1,
    revision,
    snapshotHash: snapshot.hash,
    snapshot: "working-tree overlay on recorded HEAD",
    status: "prepared-not-run",
    modelPerformanceEvidence: false,
    arms,
    protocol:
      "Fresh top-level sessions; same explicit model, reasoning, cases and budget in both arms; verify loaded instructions before trials. Use the existing A/B ledger only after real evidence. Do not adopt the candidate from word counts."
  };
  writeFileSync(path.join(directory, "experiment.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return directory;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (
    process.argv
      .slice(2)
      .filter((arg) => arg !== "--")
      .join(" ") !== "--prepare"
  )
    console.log(
      "Use pnpm harness:context --prepare. Creates disposable baseline/candidate snapshots; no model runs."
    );
  else console.log(`Prepared context experiment: ${prepareContextExperiment()}`);
}
