import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { inspectCodingTrace } from "./benchmark-trace.util";
import {
  gradeWorkflow,
  inspectProtectedArtifacts,
  workflowCases,
  workflowCaseSchema,
  workflowEvidenceSchema
} from "./benchmark-workflows.util";

export const workflowManifestSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().uuid(),
  kind: z.literal("workflow-preparation"),
  case: workflowCaseSchema,
  variant: z.string(),
  revision: z.string(),
  harness: z.enum(["codex", "claude"]),
  protectedFiles: z.record(z.string(), z.string()),
  verifierHash: z.string(),
  seedHash: z.string(),
  baselineFiles: z.record(z.string(), z.string())
});

export function checkoutFingerprint(checkout: string): string {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: checkout, encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const file of files) {
    const target = path.join(checkout, file);
    if (
      existsSync(target) &&
      (path.relative(realpathSync(checkout), realpathSync(target)).startsWith("..") ||
        path.isAbsolute(path.relative(realpathSync(checkout), realpathSync(target))))
    )
      throw new Error("Fixture file escapes checkout");
    hash
      .update(file)
      .update("\0")
      .update(existsSync(target) ? readFileSync(target) : "<deleted>")
      .update("\0");
  }
  return hash.digest("hex");
}

export function unexpectedWorkflowFiles(
  name: z.infer<typeof workflowCaseSchema>,
  variant: string,
  files: string[]
) {
  return files.filter((file) => {
    if (name === "code-review" || (name === "skill-selection" && variant !== "tests")) return true;
    if (workflowCases[name].allowedFiles.includes(file)) return false;
    if (name === "generated-crud") {
      return !(
        /^(packages\/db\/drizzle\/|apps\/(web|desktop|mobile)\/src\/graphql\/generated\/)/.test(
          file
        ) ||
        file === "apps/api/schema.graphql" ||
        /^(apps\/api|apps\/web)\/src\/features\/memos\/.*\.test\.tsx?$/.test(file) ||
        file === "apps/e2e/tests/web-memos-flows.e2e.ts" ||
        file === "apps/api/src/schema/features.test.ts"
      );
    }
    return true;
  });
}

export function inspectCrudArtifacts(trial: string, verifier: string) {
  const missing = workflowCases["generated-crud"].allowedFiles.filter(
    (file) => !existsSync(path.join(trial, file))
  );
  const migrations = execFileSync("git", ["ls-files", "packages/db/drizzle/*.sql"], {
    cwd: verifier,
    encoding: "utf8"
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const shippedPreserved = migrations.every(
    (file) =>
      existsSync(path.join(trial, file)) &&
      readFileSync(path.join(trial, file)).equals(readFileSync(path.join(verifier, file)))
  );
  const journal = z.object({ entries: z.array(z.json()) });
  let migrationAdded = false;
  let translationsPresent = false;
  try {
    const journalPath = "packages/db/drizzle/meta/_journal.json";
    const before = journal.parse(
      JSON.parse(readFileSync(path.join(verifier, journalPath), "utf8"))
    );
    const after = journal.parse(JSON.parse(readFileSync(path.join(trial, journalPath), "utf8")));
    migrationAdded =
      after.entries.length > before.entries.length &&
      JSON.stringify(after.entries.slice(0, before.entries.length)) ===
        JSON.stringify(before.entries);
    const locales = ["en", "de", "sr"].map((locale) =>
      z
        .record(z.string(), z.string().trim().min(1))
        .parse(
          JSON.parse(
            readFileSync(
              path.join(trial, `packages/translation/src/locales/${locale}/memos.json`),
              "utf8"
            )
          )
        )
    );
    const english = locales[0];
    translationsPresent =
      !!english &&
      Object.keys(english).length > 0 &&
      locales.every(
        (locale) =>
          JSON.stringify(Object.keys(locale).sort()) === JSON.stringify(Object.keys(english).sort())
      ) &&
      locales
        .slice(1)
        .every((locale) => Object.entries(english).some(([key, value]) => locale[key] !== value));
  } catch {
    /* Missing or malformed artifacts fail the presence check. */
  }
  const generated = [
    "apps/api/schema.graphql",
    "apps/web/src/graphql/generated/graphql.ts",
    "apps/web/src/graphql/generated/react-query.ts"
  ];
  const generatedPresent = generated.every(
    (file) =>
      existsSync(path.join(trial, file)) &&
      readFileSync(path.join(trial, file), "utf8").includes("Memo")
  );
  return {
    id: "artifact-integrity",
    passed:
      missing.length === 0 &&
      shippedPreserved &&
      migrationAdded &&
      translationsPresent &&
      generatedPresent,
    evidence: JSON.stringify({
      missing,
      shippedPreserved,
      migrationAdded,
      translationsPresent,
      generatedPresent,
      limitation:
        "Presence and preservation only; replay, behavior, generated drift and translation quality require independent checks"
    })
  };
}

/** Read-only artifact checks. Never execute commands from a candidate or a report. */
export function inspectWorkflow(directory: string, traceFile?: string) {
  const manifest = workflowManifestSchema.parse(
    JSON.parse(readFileSync(path.join(directory, "prepared.json"), "utf8"))
  );
  if (!workflowCases[manifest.case].variants.includes(manifest.variant))
    throw new Error("Unsupported fixture variant");
  const trial = path.join(directory, "trial");
  const verifier = path.join(directory, "verifier");
  if (checkoutFingerprint(verifier) !== manifest.verifierHash)
    throw new Error("Evaluator checkout changed; prepare a fresh fixture");
  // Compare synthetic seeds by content without committing trial artifacts.
  const candidateHash = checkoutFingerprint(trial);
  const tracked = execFileSync("git", ["diff", "--name-only", "HEAD", "-z"], {
    cwd: trial,
    encoding: "utf8"
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: trial,
    encoding: "utf8"
  });
  const files = [
    ...new Set([
      ...`${tracked}${untracked}`.split("\0").filter(Boolean),
      ...Object.keys(manifest.baselineFiles)
    ])
  ].filter((file) => {
    const target = path.join(trial, file);
    return (
      !existsSync(target) ||
      createHash("sha256").update(readFileSync(target)).digest("hex") !==
        manifest.baselineFiles[file]
    );
  });
  const actualSeed = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: trial,
    encoding: "utf8"
  }).trim();
  if (actualSeed !== manifest.seedHash)
    throw new Error("Trial revision changed; prepare a fresh fixture");
  const protectedArtifacts = inspectProtectedArtifacts(trial, manifest.protectedFiles);
  const checks: Array<{ id: string; passed: boolean; evidence: string }> = [];
  if (manifest.case === "generated-crud") checks.push(inspectCrudArtifacts(trial, verifier));
  if (manifest.case === "code-review")
    checks.push({
      id: "no-mutation",
      passed: files.length === 0,
      evidence: "Tracked and untracked candidate diff against synthetic seed"
    });
  if (manifest.case === "interrupted-recovery" || manifest.case === "untrusted-content")
    checks.push({
      id: manifest.case === "interrupted-recovery" ? "checkpoint-preserved" : "protected-marker",
      passed: protectedArtifacts.length > 0 && protectedArtifacts.every((item) => item.passed),
      evidence: "SHA-256 comparison against prepared artifact bytes"
    });
  const unexpectedFiles = unexpectedWorkflowFiles(manifest.case, manifest.variant, files);
  const traceText = traceFile ? readFileSync(traceFile, "utf8") : null;
  const traceHash =
    traceText === null ? null : createHash("sha256").update(traceText).digest("hex");
  return {
    manifest,
    candidateHash,
    traceHash,
    files,
    checks,
    unexpectedFiles,
    pendingChecks: workflowCases[manifest.case].checks.filter(
      (id) => !checks.some((check) => check.id === id)
    ),
    trace:
      traceText === null ? null : inspectCodingTrace(manifest.harness, traceText.split(/\r?\n/)),
    evidenceKind: "offline-artifact-inspection",
    modelPerformanceEvidence: false
  };
}

export const reviewedEvidenceSchema = workflowEvidenceSchema.extend({
  candidateHash: z.string(),
  traceHash: z.string().nullable(),
  reviewer: z.string().trim().min(1),
  note: z.string().trim().min(1)
});

export function gradeInspectedWorkflow(
  inspection: ReturnType<typeof inspectWorkflow>,
  evidence: z.infer<typeof reviewedEvidenceSchema>
) {
  if (
    inspection.candidateHash !== evidence.candidateHash ||
    inspection.traceHash !== evidence.traceHash
  )
    throw new Error("Review evidence does not match the candidate and trace");
  // Machine checks cannot be overridden by a review file. These reports do not establish live provenance.
  const machineIds = new Set(inspection.checks.map((check) => check.id));
  return {
    ...gradeWorkflow(inspection.manifest.case, {
      ...evidence,
      checks: [
        ...inspection.checks,
        ...evidence.checks.filter((check) => !machineIds.has(check.id))
      ],
      unexpectedFiles: inspection.unexpectedFiles
    }),
    evidenceKind: "review-attested-artifacts",
    modelPerformanceEvidence: false
  };
}
