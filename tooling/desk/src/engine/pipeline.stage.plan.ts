import { plannerOutputSchema, stepRoleOf, type PlannerOutput } from "../contracts";
import { agentStep } from "./pipeline.agent";
import {
  ARTIFACTS,
  readPlan,
  renderPlanMarkdown,
  writeArtifactJson,
  writeArtifactText
} from "./pipeline.artifacts";
import { isProtectedPath, normalizeRepoPath } from "../policy/protected-paths";

const PREVIOUS_PLAN_LIMIT = 20_000;

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
export const planStage = agentStep({
  schema: plannerOutputSchema,
  prepare: async (context, _step, _agent, pending) => {
    if (pending === null) return {};
    const previous = await readPlan(context.artifactsDir);
    const earlier =
      previous.status === "ok"
        ? `Your previous plan:\n\n\`\`\`json\n${JSON.stringify(previous.value, null, 2).slice(0, PREVIOUS_PLAN_LIMIT)}\n\`\`\`\n\n`
        : "";
    return {
      feedback: `${earlier}The engineer reviewed your plan and asks for this. Revise the plan. Keep \`summary\` a description of the whole change, and say in \`revision\` what changed.\n\n${pending.text}`
    };
  },
  finish: async (context, step, _agent, run) => {
    const plan = run.result.structured;
    const problems = planPathProblems(plan);
    // A plan without files is only wrong when a change agent later carries it out. A flow that
    // only reports, such as research, has nothing to change.
    const snapshot = context.state().flowSnapshot;
    const steps = snapshot.flow.steps;
    const changeFollows = steps
      .slice(steps.findIndex((candidate) => candidate.id === step.id) + 1)
      .some((later) => stepRoleOf(snapshot, later.id) === "change");
    if (changeFollows && plan.files.length + plan.tests.length === 0) {
      problems.push("the plan lists no file to change");
    }
    if (problems.length > 0) {
      return {
        kind: "needs-you",
        reason: `The plan is not usable:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nGive feedback to the planner or continue to plan again.`
      };
    }

    await writeArtifactJson(context.artifactsDir, ARTIFACTS.plan, plan);
    await writeArtifactText(context.artifactsDir, ARTIFACTS.planMarkdown, renderPlanMarkdown(plan));
    return {
      kind: "complete",
      event: "plan-ready",
      note: `${plan.files.length} file(s), ${plan.openQuestions.length} open question(s)`
    };
  }
});
