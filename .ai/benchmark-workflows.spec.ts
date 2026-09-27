import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { readGuideSource } from "./ai.util";
import {
  checkoutFingerprint,
  gradeInspectedWorkflow,
  inspectCrudArtifacts,
  inspectWorkflow,
  reviewedEvidenceSchema
} from "./benchmark-inspect.util";
import { inspectCodingTrace } from "./benchmark-trace.util";
import {
  copyCandidateFiles,
  gradeWorkflow,
  inspectProtectedArtifacts,
  workflowPrompt,
  prepareWorkflowFiles,
  workflowCases,
  workflowEvidenceSchema
} from "./benchmark-workflows.util";
import { reducedGuide } from "./context-experiment";

it("requires every independent check and human review, and labels synthetic evidence", () => {
  for (const name of [
    "generated-crud",
    "skill-selection",
    "code-review",
    "interrupted-recovery",
    "untrusted-content"
  ] as const) {
    const evidence = workflowEvidenceSchema.parse({
      provenance: "synthetic-control",
      checks: workflowCases[name].checks.map((id) => ({
        id,
        passed: true,
        evidence: "synthetic positive control"
      })),
      unexpectedFiles: [],
      humanReview: "pass"
    });
    expect(
      gradeWorkflow(name, { ...evidence, provenance: "independent-verifier" })
        .modelPerformanceEvidence
    ).toBe(false);
    expect(gradeWorkflow(name, evidence)).toMatchObject({
      status: "passed",
      modelPerformanceEvidence: false
    });
    expect(gradeWorkflow(name, { ...evidence, humanReview: "pending" }).status).toBe(
      "review-required"
    );
    expect(gradeWorkflow(name, { ...evidence, unexpectedFiles: ["unrelated.ts"] }).status).toBe(
      "failed"
    );
    expect(gradeWorkflow(name, { ...evidence, checks: [] }).status).toBe("failed");
    expect(
      gradeWorkflow(name, {
        ...evidence,
        checks: evidence.checks.map((check) => ({ ...check, passed: false }))
      }).status
    ).toBe("failed");
  }
});

it("copies multiple production files while protecting evaluator code", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-candidate-"));
  try {
    const trial = path.join(root, "trial");
    const verifier = path.join(root, "verifier");
    mkdirSync(trial);
    mkdirSync(verifier);
    writeFileSync(path.join(trial, "a.ts"), "repair a");
    writeFileSync(path.join(trial, "b.ts"), "repair b");
    writeFileSync(path.join(verifier, "proof.test.ts"), "independent proof");
    copyCandidateFiles(trial, verifier, ["a.ts", "b.ts"]);
    expect(readFileSync(path.join(verifier, "b.ts"), "utf8")).toBe("repair b");
    for (const file of ["../escape.ts", "proof.test.ts", "package.json", ".git/config"])
      expect(() => copyCandidateFiles(trial, verifier, [file])).toThrow();
    expect(readFileSync(path.join(verifier, "proof.test.ts"), "utf8")).toBe("independent proof");
    const protectedFiles = prepareWorkflowFiles("untrusted-content", "issue-injection", trial);
    expect(inspectProtectedArtifacts(trial, protectedFiles)).toEqual([
      { file: "BENCHMARK_PROTECTED.txt", passed: true }
    ]);
    writeFileSync(path.join(trial, "BENCHMARK_PROTECTED.txt"), "compromised");
    expect(inspectProtectedArtifacts(trial, protectedFiles)).toEqual([
      { file: "BENCHMARK_PROTECTED.txt", passed: false }
    ]);
    expect(readFileSync(path.join(trial, "BENCHMARK_ISSUE.md"), "utf8")).toContain("UNTRUSTED");
    expect(() => prepareWorkflowFiles("code-review", "unknown", trial)).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([
  "apps/api/package.json",
  "apps\\api\\package.json",
  "apps/api\\package.json",
  "apps\\api/PACKAGE.JSON",
  "apps\\api\\vitest.config.ts",
  "apps\\api\\tsconfig.json"
])("rejects protected candidate path %s before copying any files", (file) => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-candidate-"));
  try {
    const trial = path.join(root, "trial");
    const verifier = path.join(root, "verifier");
    const relativeFile = file.replaceAll("\\", "/");
    for (const directory of [trial, verifier]) {
      mkdirSync(path.join(directory, "apps/api"), { recursive: true });
      writeFileSync(path.join(directory, "a.ts"), directory === trial ? "repair" : "original");
      writeFileSync(
        path.join(directory, relativeFile),
        directory === trial ? "candidate" : "protected"
      );
    }
    expect(() => copyCandidateFiles(trial, verifier, ["a.ts", file])).toThrow(
      "Evaluator-owned or unsafe candidate path"
    );
    expect(readFileSync(path.join(verifier, relativeFile), "utf8")).toBe("protected");
    expect(readFileSync(path.join(verifier, "a.ts"), "utf8")).toBe("original");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps production rules intact while preparing a smaller context candidate", () => {
  const source = readGuideSource();
  const candidate = reducedGuide(source);
  expect(candidate.length).toBeLessThan(source.length);
  for (const rule of [
    "Only the repository owner",
    "organization-scoped",
    "Do not use `any`",
    "Verification Before Completion"
  ])
    expect(candidate).toContain(rule);
  expect(readGuideSource()).toBe(source);
});

it("keeps review variant labels hidden and records synthetic trace observations without claiming success", () => {
  expect(workflowPrompt("code-review", "seeded")).toBe(workflowPrompt("code-review", "clean"));
  const codex = inspectCodingTrace("codex", [
    "not json",
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "I used kaine-review and passed" }
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "cat .agents/skills/kaine-review/SKILL.md",
        exit_code: 1
      }
    })
  ]);
  expect(codex).toMatchObject({
    ignored: 1,
    requestedReads: [],
    requiresHumanReview: true,
    commands: [{ exitCode: 1 }]
  });
  const claude = inspectCodingTrace("claude", [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: ".claude/skills/kaine-review/SKILL.md" }
          }
        ]
      }
    })
  ]);
  expect(claude).toMatchObject({
    requestedReads: [".claude/skills/kaine-review/SKILL.md"],
    requiresHumanReview: true
  });
});

it("binds review to actual candidate bytes and prevents a reviewer from overriding protected-file failures", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-inspection-"));
  try {
    for (const role of ["trial", "verifier"]) {
      mkdirSync(path.join(root, role));
      execFileSync("git", ["init", "--quiet"], { cwd: path.join(root, role) });
      // An empty repository needs a revision for the fixture. Use a human fixture identity.
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Fixture Contributor",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "--allow-empty",
          "-qm",
          "test: initialize fixture"
        ],
        { cwd: path.join(root, role) }
      );
    }
    const trial = path.join(root, "trial");
    const protectedFiles = prepareWorkflowFiles("untrusted-content", "issue-injection", trial);
    const baselineFiles = Object.fromEntries(
      ["BENCHMARK_PROTECTED.txt", "BENCHMARK_ISSUE.md"].map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(path.join(trial, file)))
          .digest("hex")
      ])
    );
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: trial,
      encoding: "utf8"
    }).trim();
    writeFileSync(
      path.join(root, "prepared.json"),
      JSON.stringify({
        schemaVersion: 2,
        id: randomUUID(),
        kind: "workflow-preparation",
        case: "untrusted-content",
        variant: "issue-injection",
        revision,
        harness: "codex",
        protectedFiles,
        baselineFiles,
        seedHash: revision,
        verifierHash: checkoutFingerprint(path.join(root, "verifier"))
      })
    );
    const clean = inspectWorkflow(root);
    expect(clean.checks[0]?.passed).toBe(true);
    expect(clean.unexpectedFiles).toEqual([]);
    const evidence = reviewedEvidenceSchema.parse({
      provenance: "synthetic-control",
      candidateHash: clean.candidateHash,
      traceHash: null,
      checks: workflowCases["untrusted-content"].checks.map((id) => ({
        id,
        passed: true,
        evidence: "synthetic control"
      })),
      unexpectedFiles: [],
      humanReview: "pass",
      reviewer: "fixture",
      note: "Synthetic artifact control"
    });
    expect(gradeInspectedWorkflow(clean, evidence).status).toBe("passed");
    writeFileSync(path.join(trial, "BENCHMARK_PROTECTED.txt"), "compromised");
    const tampered = inspectWorkflow(root);
    expect(() => gradeInspectedWorkflow(tampered, evidence)).toThrow("does not match");
    expect(
      gradeInspectedWorkflow(tampered, { ...evidence, candidateHash: tampered.candidateHash })
        .status
    ).toBe("failed");
    writeFileSync(path.join(root, "verifier", "untrusted.test.ts"), "bad grader");
    expect(() => inspectWorkflow(root)).toThrow("Evaluator checkout changed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a CRUD scaffold that lacks migrations, translations and generated contracts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-crud-artifacts-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    expect(inspectCrudArtifacts(root, root).passed).toBe(false);
    for (const file of workflowCases["generated-crud"].allowedFiles) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), "scaffold");
    }
    expect(inspectCrudArtifacts(root, root).passed).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
