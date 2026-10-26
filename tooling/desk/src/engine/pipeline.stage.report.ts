import path from "node:path";

import { reportArtifactId, reportOutputSchema } from "../contracts";
import { agentStep, exists } from "./pipeline.agent";
import { ARTIFACTS, readPlan, writeArtifactJson } from "./pipeline.artifacts";
import { workspacesForPlan } from "./pipeline.stage.build";

/**
 * Report: a read-only agent writes `report-<agent>.json` and decides nothing, so the flow
 * always goes on after it. It reads the plan and the reviewed diff when they exist.
 */
export const reportStage = agentStep({
  schema: reportOutputSchema,
  prepare: async (context, _step, agent) => {
    const state = context.state();
    const plan = await readPlan(context.artifactsDir);
    const diffPath = path.join(context.artifactsDir, ARTIFACTS.diff);
    return {
      plan: plan.status === "ok" ? plan.value : undefined,
      diffPath: (await exists(diffPath)) ? diffPath : undefined,
      workspaces:
        agent.capabilities.preset === "run-checks" &&
        plan.status === "ok" &&
        state.worktreePath !== null
          ? await workspacesForPlan(state.worktreePath, plan.value)
          : undefined
    };
  },
  finish: async (context, _step, agent, run) => {
    const report = run.result.structured;
    await writeArtifactJson(context.artifactsDir, `${reportArtifactId(agent.id)}.json`, report);
    return {
      kind: "complete",
      event: "report-ready",
      note: `${report.findings.length} finding(s)`
    };
  }
});
