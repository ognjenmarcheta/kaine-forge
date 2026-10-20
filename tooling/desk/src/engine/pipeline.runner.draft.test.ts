import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ISSUE_DRAFT_FILE } from "./intake.draft";
import { INTAKE_FIT_FILE } from "./intake.run";
import {
  intakeFitRecordSchema,
  issueDraftSchema,
  type IntakeFit,
  type IntakeOutput,
  type IssueState
} from "../contracts";
import { parseContract } from "../github/github.contract";
import { snapshotOf } from "../testing/github.fake";
import {
  ISSUE,
  createPipelineEnv,
  planOutput,
  type EnvOptions,
  type PipelineEnv,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: PipelineEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

/** The shape of #457: real content under headings intake does not know. */
const OLD_BODY = [
  "## Removal trigger and acceptance",
  "- Remove GHSA-86w9-cpqp-85rv from auditConfig.ignoreGhsas.",
  "## Exposure",
  "Expo certificate tooling calls the affected code."
].join("\n");

const intakeOutput = (over: Partial<IntakeOutput> = {}): IntakeOutput => ({
  recommendation: "needs-info",
  reasons: ["It waits for a fixed upstream release."],
  fit: {
    clarity: { score: 3, reason: "One reading only." },
    complexity: { score: 2, reason: "One config file, with a release to wait for." },
    verifiability: { score: 3, reason: "pnpm audit proves the criterion." }
  },
  draft: {
    outcome: "pnpm audit passes without the node-forge exception.",
    acceptanceCriteria: ["GHSA-86w9-cpqp-85rv is not in auditConfig.ignoreGhsas"],
    scope: "pnpm-workspace.yaml",
    validation: "pnpm audit --audit-level high, pnpm check",
    evidence: "pnpm-workspace.yaml:80",
    outOfScope: ["The Expo SDK pins"]
  },
  unknowns: [{ section: "evidence", question: "Which node-forge release fixes it?" }],
  plainLanguage: "Remove a temporary security exception once a fix exists.",
  ...over
});

const intakeStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "intake",
  output: intakeOutput(),
  ...over
});

/** An issue that stopped at intake: no acceptance criteria under a known heading. */
const stoppedAtIntake = async (options: EnvOptions = {}): Promise<PipelineEnv> => {
  // Real git: the draft runs in the repository root, which the fake git does not model.
  env = await createPipelineEnv({
    git: "real",
    github: { snapshot: snapshotOf({ number: ISSUE, body: OLD_BODY }) },
    ...options
  });
  await env.pipeline.start(ISSUE, { override: true });
  return env;
};

const stateOf = async (e: PipelineEnv): Promise<IssueState> => {
  const read = await e.store.read(ISSUE);
  if (read.status !== "ok") throw new Error(`state is ${read.status}`);
  return read.state;
};

const draftFile = (e: PipelineEnv): string =>
  path.join(e.store.artifactsDir(ISSUE), ISSUE_DRAFT_FILE);

const fitFile = (e: PipelineEnv): string => path.join(e.store.artifactsDir(ISSUE), INTAKE_FIT_FILE);

/** Clear and checkable, but cross-cutting: confidence 1. */
const LOW_FIT: IntakeFit = {
  clarity: { score: 3, reason: "One reading only." },
  complexity: { score: 1, reason: "Touches every workspace." },
  verifiability: { score: 2, reason: "One criterion needs a manual check." }
};

const fitWarnings = async (e: PipelineEnv): Promise<string[]> =>
  (await stateOf(e)).history
    .filter((entry) => entry.event === "fit-warning")
    .map((entry) => entry.note ?? "");

const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false
  );

describe("draft", () => {
  it("drafts the issue format in the main checkout and leaves the issue where it stopped", async () => {
    const e = await stoppedAtIntake({ steps: [intakeStep()] });
    expect(await stateOf(e)).toMatchObject({ stage: "needs-you", resumeStage: "intake" });

    const writesBefore = JSON.stringify([e.github.comments, e.github.labelEdits]);

    const result = await e.pipeline.draft(ISSUE);

    expect(result.outcome).toBe("drafted");
    const draft = issueDraftSchema.parse(JSON.parse(await readFile(draftFile(e), "utf8")));
    expect(draft).toMatchObject({
      issue: ISSUE,
      contract: { found: 6, total: 6 },
      acceptanceCriteria: 1,
      recommendation: "needs-info",
      fit: intakeOutput().fit,
      provider: "claude"
    });
    // The score outlives the draft, for the body it was scored on.
    const record = intakeFitRecordSchema.parse(JSON.parse(await readFile(fitFile(e), "utf8")));
    expect(record).toMatchObject({
      fit: intakeOutput().fit,
      originalBodyHash: draft.originalBodyHash
    });
    // Every fact of the author stays, as a quote that no section reads.
    expect(draft.body).toContain("> ## Removal trigger and acceptance");
    expect(parseContract(draft.body).acceptanceCriteria).toEqual([
      "GHSA-86w9-cpqp-85rv is not in auditConfig.ignoreGhsas"
    ]);

    const [request] = e.runner.requests;
    expect(request).toMatchObject({ role: "intake", cwd: e.repoRoot });
    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "needs-you", resumeStage: "intake", activeProcess: null });
    expect(state.history.slice(-2).map((entry) => entry.event)).toEqual([
      "draft-started",
      "draft-ready"
    ]);
    // The refs baseline belongs to the worktree that ship commits from. The draft records none.
    expect(await exists(path.join(e.store.artifactsDir(ISSUE), "refs-baseline.json"))).toBe(false);
    // Nothing reached GitHub.
    expect(JSON.stringify([e.github.comments, e.github.labelEdits])).toBe(writesBefore);
  });

  it("stops an agent that changes the main checkout, and keeps no draft", async () => {
    const e = await stoppedAtIntake({
      steps: [
        intakeStep({
          effect: async () => {
            if (env === null) return;
            await writeFile(path.join(env.repoRoot, "planted.txt"), "x\n");
          }
        })
      ]
    });

    const result = await e.pipeline.draft(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    if (result.outcome === "stopped") expect(result.message).toContain("read-only");
    expect(await exists(draftFile(e))).toBe(false);
    expect((await stateOf(e)).history.at(-1)?.event).toBe("draft-failed");
  });

  it("keeps no draft when no acceptance criterion is supported, and names the questions", async () => {
    const e = await stoppedAtIntake({
      steps: [
        intakeStep({
          output: intakeOutput({
            draft: { ...intakeOutput().draft, acceptanceCriteria: [] },
            unknowns: [{ section: "acceptance-criteria", question: "What must be true when done?" }]
          })
        })
      ]
    });

    const result = await e.pipeline.draft(ISSUE);

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    if (result.outcome === "stopped") {
      expect(result.message).toContain("Only the author can add them.");
      expect(result.message).toContain("What must be true when done?");
    }
    expect(await exists(draftFile(e))).toBe(false);
  });

  it("refuses an issue that did not stop at intake", async () => {
    env = await createPipelineEnv({ steps: [{ role: "planner", output: planOutput() }] });
    await env.pipeline.start(ISSUE, { override: false });

    expect(await env.pipeline.draft(ISSUE)).toMatchObject({
      outcome: "refused",
      refusal: "invalid-transition"
    });
    expect(env.runner.requests.map((request) => request.role)).toEqual(["planner"]);
  });
});

describe("applyDraft", () => {
  const drafted = async (options: EnvOptions = {}): Promise<PipelineEnv> => {
    const e = await stoppedAtIntake({ steps: [intakeStep()], ...options });
    expect((await e.pipeline.draft(ISSUE)).outcome).toBe("drafted");
    return e;
  };

  it("replaces the body with the draft, and the next start reads it as a full contract", async () => {
    const e = await drafted({
      steps: [intakeStep(), { role: "planner", output: planOutput() }]
    });
    const draft = issueDraftSchema.parse(JSON.parse(await readFile(draftFile(e), "utf8")));

    const result = await e.pipeline.applyDraft(ISSUE, { confirm: true });

    expect(result).toMatchObject({ outcome: "stopped", stop: "needs-you" });
    expect(e.github.bodyEdits).toEqual([{ issue: ISSUE, body: draft.body }]);
    expect(await exists(draftFile(e))).toBe(false);
    const state = await stateOf(e);
    expect(state).toMatchObject({ stage: "needs-you", resumeStage: "intake" });
    expect(state.history.at(-1)?.event).toBe("draft-applied");

    expect(await e.pipeline.start(ISSUE, { override: true })).toMatchObject({
      outcome: "stopped",
      stop: "gate"
    });
    // Confidence 2: no warning.
    expect(await fitWarnings(e)).toEqual([]);
    expect((await stateOf(e)).stage).toBe("plan-gate");
  });

  it("warns at start when the applied draft scored confidence 1, and still runs the issue", async () => {
    const e = await stoppedAtIntake({
      steps: [
        intakeStep({ output: intakeOutput({ fit: LOW_FIT }) }),
        { role: "planner", output: planOutput() }
      ]
    });
    expect((await e.pipeline.draft(ISSUE)).outcome).toBe("drafted");
    expect((await e.pipeline.applyDraft(ISSUE, { confirm: true })).outcome).toBe("stopped");
    expect(await exists(fitFile(e))).toBe(true);

    expect(await e.pipeline.start(ISSUE, { override: true })).toMatchObject({
      outcome: "stopped",
      stop: "gate"
    });

    const warnings = await fitWarnings(e);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Fit confidence is 1 of 3");
    expect(warnings[0]).toContain("complexity: Touches every workspace.");
    expect((await stateOf(e)).stage).toBe("plan-gate");
  });

  it("ignores a fit score for a body that changed after the draft", async () => {
    const e = await stoppedAtIntake({
      steps: [
        intakeStep({ output: intakeOutput({ fit: LOW_FIT }) }),
        { role: "planner", output: planOutput() }
      ]
    });
    expect((await e.pipeline.draft(ISSUE)).outcome).toBe("drafted");
    const draft = issueDraftSchema.parse(JSON.parse(await readFile(draftFile(e), "utf8")));
    e.github.setIssueBody(`${draft.body}\n\nThe owner narrowed the scope by hand.`);

    expect((await e.pipeline.start(ISSUE, { override: true })).outcome).toBe("stopped");

    expect((await stateOf(e)).stage).toBe("plan-gate");
    expect(await fitWarnings(e)).toEqual([]);
  });

  it.each([["without confirmation", { confirm: false }, "explicit confirmation"]] as const)(
    "refuses %s and writes nothing",
    async (_name, options, reason) => {
      const e = await drafted();
      const result = await e.pipeline.applyDraft(ISSUE, options);
      expect(result).toMatchObject({ outcome: "refused", refusal: "draft-refused" });
      if (result.outcome === "refused") expect(result.reason).toContain(reason);
      expect(e.github.bodyEdits).toEqual([]);
      expect(await exists(draftFile(e))).toBe(true);
    }
  );

  it("refuses when someone changed the issue after the draft", async () => {
    const e = await drafted();
    e.github.setIssueBody("Edited on GitHub by someone else.");

    const result = await e.pipeline.applyDraft(ISSUE, { confirm: true });

    expect(result).toMatchObject({ outcome: "refused", refusal: "draft-refused" });
    if (result.outcome === "refused") expect(result.reason).toContain("changed on GitHub");
    expect(e.github.bodyEdits).toEqual([]);
  });

  it("refuses an issue that writes nothing to GitHub", async () => {
    const e = await drafted({ noWriteback: true });
    const result = await e.pipeline.applyDraft(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "refused", refusal: "draft-refused" });
    if (result.outcome === "refused") expect(result.reason).toContain("writes nothing to GitHub");
    expect(e.github.bodyEdits).toEqual([]);
  });

  it("refuses without a draft, and checks a stored draft again before it writes", async () => {
    const e = await stoppedAtIntake({ steps: [intakeStep()] });
    expect(await e.pipeline.applyDraft(ISSUE, { confirm: true })).toMatchObject({
      outcome: "refused",
      refusal: "draft-refused"
    });

    expect((await e.pipeline.draft(ISSUE)).outcome).toBe("drafted");
    const draft = issueDraftSchema.parse(JSON.parse(await readFile(draftFile(e), "utf8")));
    await writeFile(draftFile(e), JSON.stringify({ ...draft, body: "## Outcome\nOnly this." }));

    const result = await e.pipeline.applyDraft(ISSUE, { confirm: true });
    expect(result).toMatchObject({ outcome: "refused", refusal: "draft-refused" });
    if (result.outcome === "refused") expect(result.reason).toContain("full contract");
    expect(e.github.bodyEdits).toEqual([]);
  });
});
