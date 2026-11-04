import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { approvalRefusal } from "../agents/agent.approval";
import { readPolicyDenies } from "../agents/permissions";
import { MAX_COMMAND_CHARS, agentOf, stepOf, type IssueState } from "../contracts";
import { needsYouReason } from "./pipeline.state";

/** The part of `agent-<id>.json` that lists what the run tried and the desk refused. */
const summarySchema = z.object({
  denials: z.array(z.object({ tool: z.string(), command: z.string().optional() }))
});

/**
 * The commands that the owner may allow now: what the last run of the stage to retry tried, and
 * the desk refused, as one exact simple command each. Empty unless the issue is in `needs-you` at
 * an agent step that can run commands, and the stop is one the agent wrote itself in `blockers`
 * (`<agent> is blocked:`) and that names the command. Another stop, such as a scope violation or a
 * failed check, is not caused by a refused command. A command the owner allowed already, one that
 * no owner may allow, and one over the request limit is left out.
 */
export const deniedCommands = async (
  artifactsDir: string,
  state: IssueState
): Promise<string[]> => {
  if (state.stage !== "needs-you" || state.resumeStage === null) return [];
  const step = stepOf(state.flowSnapshot, state.resumeStage);
  if (step?.kind !== "agent") return [];
  // A read-only agent never gets an approved command, so an approval could not change its stop.
  const agent = agentOf(state.flowSnapshot, step.agent);
  if (agent === undefined || agent.capabilities.preset === "read-only") return [];
  const reason = needsYouReason(state);
  if (reason === null || !/ is blocked:\n/.test(reason)) return [];
  let summary: z.infer<typeof summarySchema>;
  try {
    const file = await readFile(path.join(artifactsDir, `agent-${step.agent}.json`), "utf8");
    summary = summarySchema.parse(JSON.parse(file));
  } catch {
    return [];
  }
  const policy =
    state.worktreePath === null ? [] : await readPolicyDenies(state.worktreePath).catch(() => []);
  const approved = new Set(state.approvedCommands ?? []);
  const commands = summary.denials.flatMap((denial) =>
    denial.tool === "Bash" && denial.command !== undefined ? [denial.command.trim()] : []
  );
  return [...new Set(commands)].filter(
    (command) =>
      command.length <= MAX_COMMAND_CHARS &&
      reason.includes(command) &&
      !approved.has(command) &&
      approvalRefusal(command, policy) === null
  );
};

/** What the agent reads when the owner skips a command the desk refused. It is for the agent, so it is not translated. */
export const skippedCommandNote = (command: string): string =>
  `The desk refused \`${command}\` and the owner chose to skip it. Do not run it and do not ask for it again. ` +
  "List it as not-run in claimedChecks, write in notes that the owner may run it, and finish the rest of the work.";
