import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./ai.util";
import { benchmarkFixtures, seedBenchmark } from "./benchmark-fixtures";
import { checkoutFingerprint } from "./benchmark-inspect.util";
import {
  prepareWorkflowFiles,
  type WorkflowCase,
  workflowCases,
  workflowPrompt
} from "./benchmark-workflows.util";

export function prepareWorkflow(name: WorkflowCase, variant: string, harness: "codex" | "claude") {
  const definition = workflowCases[name];
  if (!definition.variants.includes(variant))
    throw new Error(`Choose a variant: ${definition.variants.join(", ")}`);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  }).trim();
  const id = randomUUID();
  const directory = path.join(REPO_ROOT, ".ai.local/benchmarks", id);
  mkdirSync(directory, { recursive: true });
  for (const role of ["trial", "verifier"]) {
    const checkout = path.join(directory, role);
    execFileSync("git", ["clone", "--no-hardlinks", "--local", REPO_ROOT, checkout], {
      stdio: "pipe"
    });
    execFileSync("git", ["checkout", "--detach", revision], { cwd: checkout, stdio: "pipe" });
  }
  const trial = path.join(directory, "trial");
  const seededCase =
    name === "code-review" && variant === "seeded"
      ? "notes-deletion"
      : ["interrupted-recovery", "untrusted-content"].includes(name)
        ? "query-key"
        : null;
  if (seededCase) {
    const file = path.join(trial, benchmarkFixtures[seededCase].target);
    writeFileSync(file, seedBenchmark(readFileSync(file, "utf8"), seededCase));
  }
  if (name === "generated-crud") {
    const source = readFileSync(path.join(REPO_ROOT, ".ai/fixtures/crud.verifier.test.txt"), "utf8")
      .replaceAll("__plural__", "memos")
      .replaceAll("__Singular__", "Memo")
      .replaceAll("__singular__", "memo");
    writeFileSync(path.join(directory, "verifier/apps/api/src/benchmark.crud.test.ts"), source);
  }
  const protectedFiles = prepareWorkflowFiles(name, variant, trial);
  const baselineFiles: Record<string, string> = {};
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "-z"], {
    cwd: trial,
    encoding: "utf8"
  });
  const added = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: trial,
    encoding: "utf8"
  });
  for (const file of `${changed}${added}`.split("\0").filter(Boolean))
    baselineFiles[file] = createHash("sha256")
      .update(readFileSync(path.join(trial, file)))
      .digest("hex");
  const manifest = {
    schemaVersion: 2,
    id,
    kind: "workflow-preparation",
    case: name,
    variant,
    revision,
    harness,
    seedHash: revision,
    baselineFiles,
    verifierHash: checkoutFingerprint(path.join(directory, "verifier")),
    execution: "not-run",
    liveDispatch: "unsupported",
    evidenceKind: "offline-preparation",
    expectedArtifacts: definition.allowedFiles,
    protectedFiles,
    requiredChecks: definition.checks,
    verificationCommands: definition.commands,
    rubric: definition.rubric,
    additionalReview:
      name === "generated-crud"
        ? "Review new migration SQL/meta and generated GraphQL separately; preserve all shipped migrations and use independent PGlite tests."
        : null
  };
  writeFileSync(path.join(directory, "prepared.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(directory, "prompt.md"), `${workflowPrompt(name, variant)}\n`);
  return { id, directory, manifest };
}
