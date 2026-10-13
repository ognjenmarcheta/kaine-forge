import { stripVTControlCharacters } from "node:util";

import { repoFingerprint } from "./harness.fingerprint";
import type { StageContext } from "./pipeline.types";
import type { AgentDenial } from "../agents/agent.runner";
import type { Violation } from "../agents/agent.verify";
import { normalizeLine, type CheckReport } from "../check";
import {
  LESSON_DETAIL_LIMIT,
  type AgentStageRole,
  type LessonRecord,
  type LessonSource,
  type ReviewFinding
} from "../contracts";
import { appendLessonRecords } from "../stats/stats.lessons";

/**
 * Observations for `lessons.jsonl`. Each key names a kind of problem, the same in every
 * issue: no issue number, worktree path, line number or time goes into it. The owner reads
 * the keys that come back in several issues with `pnpm desk lessons`.
 */
export interface LessonObservation {
  readonly role: AgentStageRole | null;
  readonly source: LessonSource;
  readonly key: string;
  readonly detail: string;
  readonly file?: string | null;
}

const KEY_LIMIT = 200;
const FILE_LIMIT = 500;

const clean = (text: string, limit: number): string =>
  stripVTControlCharacters(text).replace(/\s+/g, " ").trim().slice(0, limit);

const keyOf = (...parts: string[]): string => clean(parts.join("/"), KEY_LIMIT);

/** The accepted findings of a review: one observation per finding. */
export const reviewLessons = (findings: readonly ReviewFinding[]): LessonObservation[] =>
  findings.map((finding) => ({
    role: "reviewer",
    source: "review",
    key: keyOf("review", finding.section, finding.severity),
    detail: finding.summary,
    file: finding.file
  }));

/** A failed check: the first step that failed, or the generated drift. */
export const checkLessons = (report: CheckReport): LessonObservation[] => {
  if (report.passed) return [];
  const fingerprint = (report.fingerprint ?? "unknown").slice(0, 12);
  if (report.generatedDrift) {
    return [
      {
        role: null,
        source: "check",
        key: "check/generated-drift",
        detail: `pnpm generate changed the tree (fingerprint ${fingerprint})`
      }
    ];
  }
  const failed = report.steps.find((step) => step.timedOut || step.code !== 0);
  if (failed === undefined) return [];
  return [
    {
      role: null,
      source: "check",
      key: keyOf("check", `${failed.argv.join(" ")}${failed.timedOut ? " (timeout)" : ""}`),
      detail: `fingerprint ${fingerprint}`
    }
  ];
};

export interface AgentRunEvidence {
  readonly role: AgentStageRole;
  /** The checkout, blanked out of commands so the key is the same in every worktree. */
  readonly checkout: string;
  readonly stuckOn: string | null;
  readonly stuckReason: string | null;
  readonly denials: readonly AgentDenial[];
  /** Verification violations. Permission denials come from `denials` instead. */
  readonly violations: readonly Violation[];
  readonly invariants: readonly ("refs" | "read-only")[];
}

/** What one agent run showed: a stuck stop, denials, verification violations, broken invariants. */
export const agentRunLessons = (run: AgentRunEvidence): LessonObservation[] => {
  const { role } = run;
  const observed: LessonObservation[] = [];
  if (run.stuckOn !== null) {
    observed.push({
      role,
      source: "stuck",
      key: keyOf("stuck", normalizeLine(run.stuckOn, [run.checkout])),
      detail: run.stuckReason ?? run.stuckOn
    });
  }
  for (const denial of run.denials) {
    const word = denial.command?.trim().split(/\s+/, 1)[0] ?? "";
    observed.push({
      role,
      source: "denial",
      key: keyOf("denial", denial.tool, ...(word === "" ? [] : [word])),
      detail: normalizeLine(denial.command ?? denial.paths.join(" "), [run.checkout])
    });
  }
  for (const violation of run.violations) {
    if (violation.kind === "permission-denied") continue;
    observed.push({
      role,
      source: "verify",
      key: keyOf("verify", violation.kind),
      detail: normalizeLine(violation.message, [run.checkout])
    });
  }
  for (const invariant of run.invariants) {
    observed.push({
      role,
      source: "invariant",
      key: keyOf("invariant", invariant),
      detail: `The ${role} run broke the ${invariant} invariant`
    });
  }
  return observed;
};

/**
 * Appends the observations, one record per key with its count. `repo` is the instruction
 * hash they were made under. A failed write is logged and never fails the stage.
 */
export const recordLessons = async (
  context: StageContext,
  observations: readonly LessonObservation[],
  repo: string | null
): Promise<void> => {
  if (observations.length === 0) return;
  const at = context.deps.clock.now().toISOString();
  const byKey = new Map<string, LessonRecord>();
  for (const observation of observations) {
    const seen = byKey.get(observation.key);
    if (seen !== undefined) {
      byKey.set(observation.key, { ...seen, count: seen.count + 1 });
      continue;
    }
    byKey.set(observation.key, {
      schema: 1,
      at,
      issue: context.issue,
      role: observation.role,
      source: observation.source,
      key: observation.key,
      detail: clean(observation.detail, LESSON_DETAIL_LIMIT),
      file:
        observation.file === undefined || observation.file === null
          ? null
          : clean(observation.file, FILE_LIMIT) || null,
      count: 1,
      repo
    });
  }
  try {
    await appendLessonRecords(context.deps.location.stateRoot, [...byKey.values()]);
  } catch (error) {
    context.log(
      `could not record lessons: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** For observations outside an agent run: the instruction hash is read from the checkout now. */
export const recordCheckoutLessons = async (
  context: StageContext,
  observations: readonly LessonObservation[],
  checkout: string
): Promise<void> => {
  if (observations.length === 0) return;
  const repo = await repoFingerprint(checkout).catch(() => null);
  await recordLessons(context, observations, repo);
};
