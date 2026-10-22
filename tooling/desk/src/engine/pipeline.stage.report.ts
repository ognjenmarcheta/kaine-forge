import { stat } from "node:fs/promises";
import path from "node:path";

import { reportOutputSchema } from "../contracts";
import { ROLE_FOR_OUTPUT, runAgentStage } from "./pipeline.agent";
import { ARTIFACTS, readPlan, writeArtifactJson } from "./pipeline.artifacts";
import { workspacesForPlan } from "./pipeline.stage.build";
import type { AgentStepHandler } from "./pipeline.types";

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

/**
 * Report: a read-only agent writes `report-<agent>.json` and decides nothing, so the flow
 * always goes on after it. It reads the plan and the reviewed diff when they exist.
 */
export const reportStage: AgentStepHandler = async (context, step, agent) => {
  const state = context.state();
  const plan = await readPlan(context.artifactsDir);
  const diffPath = path.join(context.artifactsDir, ARTIFACTS.diff);
  const pending = state.pendingFeedback?.target === step.id ? state.pendingFeedback : null;

  const run = await runAgentStage(context, {
    role: ROLE_FOR_OUTPUT[agent.output],
    agent,
    schema: reportOutputSchema,
    readOnly: true,
    feedback: pending?.text,
    plan: plan.status === "ok" ? plan.value : undefined,
    diffPath: (await exists(diffPath)) ? diffPath : undefined,
    workspaces:
      agent.capabilities.preset === "run-checks" &&
      plan.status === "ok" &&
      state.worktreePath !== null
        ? await workspacesForPlan(state.worktreePath, plan.value)
        : undefined
  });
  if (!run.ok) {
    return run.aborted ? { kind: "aborted" } : { kind: "needs-you", reason: run.reason };
  }

  const report = run.result.structured;
  await writeArtifactJson(context.artifactsDir, `report-${agent.id}.json`, report);
  return {
    kind: "complete",
    event: "report-ready",
    note: `${report.findings.length} finding(s)`,
    ...(pending === null ? {} : { patch: { pendingFeedback: null } })
  };
};
