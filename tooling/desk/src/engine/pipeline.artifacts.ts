import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

import type { EarlierReport } from "../agents/roles";
import {
  plannerOutputSchema,
  reportArtifactId,
  reportOutputSchema,
  stepRoleOf,
  type FlowSnapshot,
  type PlannerOutput
} from "../contracts";
import { writeJsonAtomic } from "../store/store.atomic";

/** Files the stages write under `<state>/issues/<n>/artifacts/`. */
export const ARTIFACTS = {
  ticket: "ticket.md",
  plan: "plan.json",
  planMarkdown: "plan.md",
  build: "build.json",
  review: "review.json",
  diff: "diff.patch",
  feedback: "feedback.md",
  /** What the last PR feedback round collected: the selected items, the head, and when. */
  prFeedback: "pr-feedback.json"
} as const;

export const artifactPath = (dir: string, name: string): string => path.join(dir, name);

export const writeArtifactJson = (dir: string, name: string, value: unknown): Promise<void> =>
  writeJsonAtomic(path.join(dir, name), value);

export const writeArtifactText = async (dir: string, name: string, text: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), text, "utf8");
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const readArtifactText = async (dir: string, name: string): Promise<string | null> => {
  try {
    return await readFile(path.join(dir, name), "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
};

export type ArtifactJson<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "missing" }
  | { readonly status: "invalid"; readonly detail: string };

/** Read and validate an artifact. A missing or malformed file is a result, not an exception. */
export const readArtifactJson = async <T>(
  dir: string,
  name: string,
  schema: z.ZodType<T>
): Promise<ArtifactJson<T>> => {
  const text = await readArtifactText(dir, name);
  if (text === null) return { status: "missing" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "invalid", detail: `${name} is not valid JSON` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success
    ? { status: "ok", value: parsed.data }
    : {
        status: "invalid",
        detail: `${name}: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`
      };
};

export const readPlan = (dir: string): Promise<ArtifactJson<PlannerOutput>> =>
  readArtifactJson(dir, ARTIFACTS.plan, plannerOutputSchema);

/** A report's JSON in a prompt is cut here, like the previous plan in a re-plan. */
const REPORT_PROMPT_LIMIT = 20_000;

/**
 * The reports that step `stepId` reads, in flow order: those of the report steps before it.
 * On a rerun (feedback sent the work back to the step), also those of the report steps after
 * it that wrote one, because they judged the step's earlier output. A report agent writes one
 * file however many steps use it, so it counts once, and a step never reads its own agent's
 * report. A missing or invalid file is left out.
 */
export const readEarlierReports = async (
  dir: string,
  snapshot: FlowSnapshot,
  stepId: string,
  rerun: boolean
): Promise<EarlierReport[]> => {
  const { steps } = snapshot.flow;
  const index = steps.findIndex((step) => step.id === stepId);
  const own = steps[index];
  const agents = new Set<string>();
  steps.forEach((step, at) => {
    if (at === index || (!rerun && at > index) || step.kind !== "agent") return;
    if (own?.kind === "agent" && own.agent === step.agent) return;
    if (stepRoleOf(snapshot, step.id) === "report") agents.add(step.agent);
  });
  const reports: EarlierReport[] = [];
  for (const agent of agents) {
    const report = await readArtifactJson(
      dir,
      `${reportArtifactId(agent)}.json`,
      reportOutputSchema
    );
    if (report.status !== "ok") continue;
    reports.push({
      agent,
      json: JSON.stringify(report.value, null, 2).slice(0, REPORT_PROMPT_LIMIT)
    });
  }
  return reports;
};

/** Markdown for the plan gate. Lists only: the repository does not generate Markdown tables. */
export const renderPlanMarkdown = (plan: PlannerOutput): string => {
  const list = (items: readonly string[]): string =>
    items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
  return [
    "# Plan",
    "",
    plan.summary,
    "",
    ...(plan.revision === null ? [] : ["## Revision", plan.revision, ""]),
    "## Acceptance criteria",
    list(plan.acceptanceCriteria.map((entry) => `${entry.criterion}: ${entry.change}`)),
    "",
    "## Files",
    list(plan.files.map((file) => `${file.action} \`${file.path}\`: ${file.purpose}`)),
    "",
    "## Tests",
    list(plan.tests.map((test) => `${test.action} \`${test.path}\`: ${test.reason}`)),
    "",
    ...(plan.risk === null ? [] : ["## Risk grade", plan.risk, list(plan.riskReasons), ""]),
    "## Risks",
    list(plan.risks),
    "",
    "## Open questions",
    list(plan.openQuestions),
    "",
    "## Changeset",
    plan.changeset.required
      ? `Required: ${plan.changeset.bump} for ${plan.changeset.packages.join(", ")}`
      : "Not required",
    "",
    "## Pull request",
    `Type \`${plan.pr.type}\`, slug \`${plan.pr.slug}\``,
    "",
    "## In plain language",
    plan.plainLanguage,
    ""
  ].join("\n");
};
