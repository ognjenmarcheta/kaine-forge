import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import type { EvalState } from "./assistant.eval.contract";
import type { ExecutableEvalCase } from "./assistant.eval.data";

export const evalActionSchema = z.object({
  id: z.string(),
  tool: z.string(),
  status: z.enum(["attempted", "rejected", "failed", "successful"]),
  input: z.record(z.string(), z.json()),
  output: z.json().nullable()
});
export type EvalAction = z.infer<typeof evalActionSchema>;

export function substituteFixture(text: string, ids: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match: string, key: string) => {
    const id = ids[key];
    if (!id) throw new Error(`Missing fixture id: ${key}`);
    return id;
  });
}

const orderedState = (state: EvalState): EvalState => ({
  todos: [...state.todos].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  notes: [...state.notes].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
});

export function scoreAssistantEval(input: {
  evaluation: ExecutableEvalCase;
  actions: EvalAction[];
  state: EvalState;
  ids: Record<string, string>;
  protectedRowsUnchanged: boolean;
  reply: string;
  completed: boolean;
}) {
  const { evaluation, actions, ids } = input;
  const contract = evaluation.contract;
  const checks: Array<{ name: string; passed: boolean }> = [
    { name: "completed", passed: input.completed },
    {
      name: "trajectory",
      passed: contract.trajectories.some((sequence) =>
        isDeepStrictEqual(
          sequence,
          actions.map((action) => action.tool)
        )
      )
    },
    {
      name: "stored-state",
      passed: isDeepStrictEqual(orderedState(contract.state), orderedState(input.state))
    },
    { name: "protected-rows", passed: input.protectedRowsUnchanged }
  ];
  for (const action of actions) {
    checks.push({ name: `${action.id}:settled`, passed: action.status !== "attempted" });
    if (action.status === "rejected") {
      checks.push({
        name: `${action.id}:rejection`,
        passed: contract.rejectedTools.includes(action.tool)
      });
      continue;
    }
    checks.push({
      name: `${action.id}:permitted`,
      passed: !evaluation.forbidTools.includes(action.tool)
    });
    if (action.status === "failed") {
      checks.push({
        name: `${action.id}:failure`,
        passed: contract.failedTools.includes(action.tool)
      });
    }
    if (action.tool === "listTodos" || action.tool === "listNotes") continue;
    const expected = contract.mutations.find((mutation) => mutation.tool === action.tool);
    checks.push({
      name: `${action.id}:arguments`,
      passed:
        expected !== undefined &&
        Object.entries(expected.input).every(([key, value]) =>
          isDeepStrictEqual(
            action.input[key],
            typeof value === "string" ? substituteFixture(value, ids) : value
          )
        )
    });
  }
  return {
    mechanical: checks.every((check) => check.passed) ? ("pass" as const) : ("fail" as const),
    checks,
    reviewFlags: evaluation.forbidReplyClaims.filter((claim) =>
      input.reply.toLowerCase().includes(claim.toLowerCase())
    )
  };
}
