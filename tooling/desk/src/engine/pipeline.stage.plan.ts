import { plannerOutputSchema, type IssueState, type PlannerOutput } from "../contracts";
import { ROLE_FOR_OUTPUT, runAgentStage } from "./pipeline.agent";
import {
  ARTIFACTS,
  readPlan,
  renderPlanMarkdown,
  writeArtifactJson,
  writeArtifactText
} from "./pipeline.artifacts";
import type { AgentStepHandler } from "./pipeline.types";
import { isProtectedPath, normalizeRepoPath } from "../policy/protected-paths";

const PREVIOUS_PLAN_LIMIT = 20_000;

/** Keep a session id, by agent id, when the runner returned one. An empty id means none. */
export const withSession = (
  state: IssueState,
  agentId: string,
  sessionId: string
): IssueState["sessions"] =>
  sessionId === "" ? state.sessions : { ...state.sessions, [agentId]: sessionId };

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

/** Plan: a read-only planner returns `plan.json`. The issue then goes to the next step. */
export const planStage: AgentStepHandler = async (context, step, agent) => {
  const state = context.state();
  const pending = state.pendingFeedback?.target === step.id ? state.pendingFeedback : null;

  let feedback: string | undefined;
  if (pending !== null) {
    const previous = await readPlan(context.artifactsDir);
    const earlier =
      previous.status === "ok"
        ? `Your previous plan:\n\n\`\`\`json\n${JSON.stringify(previous.value, null, 2).slice(0, PREVIOUS_PLAN_LIMIT)}\n\`\`\`\n\n`
        : "";
    feedback = `${earlier}The engineer reviewed your plan and asks for this. Revise the plan. Keep \`summary\` a description of the whole change, and say in \`revision\` what changed.\n\n${pending.text}`;
  }

  const run = await runAgentStage(context, {
    role: ROLE_FOR_OUTPUT[agent.output],
    agent,
    schema: plannerOutputSchema,
    readOnly: true,
    resumeSessionId: state.sessions[agent.id],
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
  const sessions = withSession(state, agent.id, run.result.sessionId);
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
