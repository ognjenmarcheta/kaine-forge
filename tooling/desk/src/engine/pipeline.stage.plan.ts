import { plannerOutputSchema, type IssueState, type PlannerOutput } from "../contracts";
import { runAgentStage } from "./pipeline.agent";
import {
  ARTIFACTS,
  readPlan,
  renderPlanMarkdown,
  writeArtifactJson,
  writeArtifactText
} from "./pipeline.artifacts";
import type { StageHandler } from "./pipeline.types";
import { isProtectedPath, normalizeRepoPath } from "../policy/protected-paths";

const PREVIOUS_PLAN_LIMIT = 20_000;

/** Keep a session id when the runner returned one. An empty id means none. */
export const withSession = (
  state: IssueState,
  role: "planner" | "builder",
  sessionId: string
): IssueState["sessions"] =>
  sessionId === "" ? state.sessions : { ...state.sessions, [role]: sessionId };

/** Paths in the plan that the builder may not touch, with the reason. */
export const planPathProblems = (plan: PlannerOutput): string[] => {
  const paths = [...plan.files.map((file) => file.path), ...plan.tests.map((test) => test.path)];
  return paths.flatMap((entry) =>
    normalizeRepoPath(entry) === null
      ? [`'${entry}' is not a safe repository path`]
      : isProtectedPath(entry)
        ? [`'${entry}' is a protected path`]
        : []
  );
};

/** Plan: a read-only planner returns `plan.json`. The issue then waits at the plan gate. */
export const planStage: StageHandler = async (context) => {
  const state = context.state();
  const pending = state.pendingFeedback?.target === "plan" ? state.pendingFeedback : null;

  let feedback: string | undefined;
  if (pending !== null) {
    const previous = await readPlan(context.artifactsDir);
    const earlier =
      previous.status === "ok"
        ? `Your previous plan:\n\n\`\`\`json\n${JSON.stringify(previous.value, null, 2).slice(0, PREVIOUS_PLAN_LIMIT)}\n\`\`\`\n\n`
        : "";
    feedback = `${earlier}The engineer reviewed your plan and asks for this. Revise the plan and say in \`summary\` what changed.\n\n${pending.text}`;
  }

  const run = await runAgentStage(context, {
    role: "planner",
    schema: plannerOutputSchema,
    readOnly: true,
    resumeSessionId: state.sessions.planner,
    feedback
  });
  if (!run.ok) {
    return run.aborted ? { kind: "aborted" } : { kind: "needs-you", reason: run.reason };
  }

  const plan = run.result.structured;
  const problems = planPathProblems(plan);
  if (plan.files.length + plan.tests.length === 0) {
    problems.push("the plan lists no file to change");
  }
  const sessions = withSession(state, "planner", run.result.sessionId);
  if (problems.length > 0) {
    return {
      kind: "needs-you",
      reason: `The plan is not usable:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nGive feedback to the planner or continue to plan again.`,
      patch: { sessions }
    };
  }

  await writeArtifactJson(context.artifactsDir, ARTIFACTS.plan, plan);
  await writeArtifactText(context.artifactsDir, ARTIFACTS.planMarkdown, renderPlanMarkdown(plan));
  return {
    kind: "complete",
    event: "plan-ready",
    note: `${plan.files.length} file(s), ${plan.openQuestions.length} open question(s)`,
    patch: { sessions, pendingFeedback: null }
  };
};
