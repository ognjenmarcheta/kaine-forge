import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";

import { plannerOutputSchema, type PlannerOutput } from "../contracts";
import { writeJsonAtomic } from "../store/store.atomic";

/** Files the stages write under `<state>/issues/<n>/artifacts/`. */
export const ARTIFACTS = {
  ticket: "ticket.md",
  plan: "plan.json",
  planMarkdown: "plan.md",
  build: "build.json",
  review: "review.json",
  diff: "diff.patch",
  feedback: "feedback.md"
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

/** Markdown for the plan gate. Lists only: the repository does not generate Markdown tables. */
export const renderPlanMarkdown = (plan: PlannerOutput): string => {
  const list = (items: readonly string[]): string =>
    items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
  return [
    "# Plan",
    "",
    plan.summary,
    "",
    "## Acceptance criteria",
    list(plan.acceptanceCriteria.map((entry) => `${entry.criterion}: ${entry.change}`)),
    "",
    "## Files",
    list(plan.files.map((file) => `${file.action} \`${file.path}\`: ${file.purpose}`)),
    "",
    "## Tests",
    list(plan.tests.map((test) => `${test.action} \`${test.path}\`: ${test.reason}`)),
    "",
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
