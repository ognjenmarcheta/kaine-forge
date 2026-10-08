import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { builderOutputSchema, type PlannerOutput } from "../contracts";
import { runAgentStage } from "./pipeline.agent";
import { ARTIFACTS, readPlan, writeArtifactJson } from "./pipeline.artifacts";
import { withSession } from "./pipeline.stage.plan";
import type { StageHandler } from "./pipeline.types";

const WORKSPACE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const packageNameSchema = z.object({ name: z.string() });

const readPackageName = async (file: string): Promise<string | null> => {
  try {
    const parsed = packageNameSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success && WORKSPACE_NAME.test(parsed.data.name) ? parsed.data.name : null;
  } catch {
    return null;
  }
};

const isDirectory = async (dir: string): Promise<boolean> => {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The workspaces whose scripts the builder may run: the package that owns each
 * file in the plan, found by walking up to the nearest `package.json`. The
 * root package is never included. Names are exact: a pattern would also allow
 * `pnpm --filter x exec ...`.
 */
export const workspacesForPlan = async (
  worktree: string,
  plan: PlannerOutput
): Promise<string[]> => {
  const names = new Set<string>();
  for (const entry of [...plan.files, ...plan.tests]) {
    let dir = path.posix.dirname(entry.path);
    while (dir !== "." && dir !== "/") {
      const absolute = path.join(worktree, dir);
      if (await isDirectory(absolute)) {
        const name = await readPackageName(path.join(absolute, "package.json"));
        if (name !== null) {
          names.add(name);
          break;
        }
      }
      dir = path.posix.dirname(dir);
    }
  }
  return [...names].sort();
};

/** Build: the builder implements the plan in the worktree. The next stage is `check`. */
export const buildStage: StageHandler = async (context) => {
  const state = context.state();
  const plan = await readPlan(context.artifactsDir);
  if (plan.status !== "ok") {
    return {
      kind: "needs-you",
      reason: `Build cannot start: ${plan.status === "missing" ? "plan.json is missing" : plan.detail}. Continue from plan.`
    };
  }
  const worktree = state.worktreePath;
  if (worktree === null) {
    return {
      kind: "needs-you",
      reason: "Build cannot start: there is no worktree. Continue from setup."
    };
  }
  const pending = state.pendingFeedback?.target === "build" ? state.pendingFeedback : null;

  const run = await runAgentStage(context, {
    role: "builder",
    schema: builderOutputSchema,
    readOnly: false,
    resumeSessionId: state.sessions.builder,
    feedback: pending?.text,
    plan: plan.value,
    workspaces: await workspacesForPlan(worktree, plan.value)
  });
  if (!run.ok) {
    return run.aborted ? { kind: "aborted" } : { kind: "needs-you", reason: run.reason };
  }

  const build = run.result.structured;
  await writeArtifactJson(context.artifactsDir, ARTIFACTS.build, build);
  const sessions = withSession(state, "builder", run.result.sessionId);

  if (build.blockers.length > 0) {
    return {
      kind: "needs-you",
      reason: `The builder is blocked:\n${build.blockers.map((blocker) => `- ${blocker}`).join("\n")}\nAnswer with feedback to build, or continue.`,
      patch: { sessions }
    };
  }
  if (run.diff.files.length === 0) {
    return {
      kind: "needs-you",
      reason:
        "The builder finished but changed no file. Check the plan, give feedback, or continue.",
      patch: { sessions }
    };
  }
  return {
    kind: "complete",
    event: "build-complete",
    note: `${run.diff.files.length} changed file(s)`,
    patch: { sessions, pendingFeedback: null }
  };
};
