import { describe, expect, it } from "vitest";

import { assistantEvalCases } from "./assistant.eval.data";
import { parseEvalOptions, selectedCredential } from "./assistant.eval.options";
import {
  digest,
  evalReportStatus,
  reviewEvalResult,
  type EvalReport,
  type EvalResult
} from "./assistant.eval.report";
import { scoreAssistantEval, type EvalAction } from "./assistant.eval.scoring";

function evaluation(id: string) {
  const found = assistantEvalCases.find((entry) => entry.id === id);
  if (!found) throw new Error("Missing evaluation");
  return found;
}
const create: EvalAction = {
  id: "call-1",
  tool: "createTodo",
  status: "successful",
  input: { title: "buy milk", description: null },
  output: null
};
const base = {
  evaluation: evaluation("create-simple"),
  actions: [create],
  state: evaluation("create-simple").contract.state,
  ids: {},
  protectedRowsUnchanged: true,
  reply: "Created",
  completed: true
};

describe("executable evaluation scoring", () => {
  it("requires correct arguments, final rows, completion and protected rows", () => {
    expect(scoreAssistantEval(base).mechanical).toBe("pass");
    expect(scoreAssistantEval({ ...base, state: { todos: [], notes: [] } }).mechanical).toBe(
      "fail"
    );
    expect(
      scoreAssistantEval({ ...base, actions: [{ ...create, input: { title: "wrong" } }] })
        .mechanical
    ).toBe("fail");
    expect(scoreAssistantEval({ ...base, protectedRowsUnchanged: false }).mechanical).toBe("fail");
    expect(scoreAssistantEval({ ...base, completed: false }).mechanical).toBe("fail");
    expect(
      scoreAssistantEval({ ...base, actions: [{ ...create, status: "attempted" }] }).mechanical
    ).toBe("fail");
  });
  it("accepts refusal or rejected invalid input, but never a successful blank write", () => {
    const entry = evaluation("blank-title");
    const input = { ...base, evaluation: entry, state: entry.contract.state };
    expect(scoreAssistantEval({ ...input, actions: [] }).mechanical).toBe("pass");
    expect(
      scoreAssistantEval({ ...input, actions: [{ ...create, status: "rejected" }] }).mechanical
    ).toBe("pass");
    expect(scoreAssistantEval({ ...input, actions: [create] }).mechanical).toBe("fail");
  });
  it("checks mutation target and order and treats wording only as a review flag", () => {
    const entry = evaluation("list-then-update");
    const actions: EvalAction[] = [
      { id: "list", tool: "listTodos", status: "successful", input: {}, output: [] },
      {
        id: "update",
        tool: "updateTodo",
        status: "successful",
        input: { id: "right", title: "buy oat milk" },
        output: {}
      }
    ];
    const input = {
      ...base,
      evaluation: entry,
      actions,
      state: entry.contract.state,
      ids: { "todo:buy milk": "right" },
      reply: "I have not created a new todo."
    };
    expect(scoreAssistantEval(input)).toMatchObject({
      mechanical: "pass",
      reviewFlags: ["created a new"]
    });
    expect(scoreAssistantEval({ ...input, actions: [...actions].reverse() }).mechanical).toBe(
      "fail"
    );
    expect(scoreAssistantEval({ ...input, ids: { "todo:buy milk": "other" } }).mechanical).toBe(
      "fail"
    );
  });
  it("validates selection and requires explicit model and selected credential", () => {
    expect(parseEvalOptions([])).toMatchObject({ live: false, repeat: 1 });
    for (const args of [
      ["--live"],
      ["--repeat", "0"],
      ["--repeat", "6"],
      ["--case", "missing"],
      ["--unknown"]
    ])
      expect(() => parseEvalOptions(args)).toThrow();
    expect(() => selectedCredential("deepseek", { OPENAI_API_KEY: "unused" })).toThrow(
      "DEEPSEEK_API_KEY"
    );
  });
  it("keeps incomplete or unreviewed runs distinct from passing and binds review to evidence", () => {
    const result: EvalResult = {
      id: "c9ad8718-9186-41d4-8c57-79f154372b25",
      caseId: "create-simple",
      repetition: 1,
      prompt: "test",
      reply: "done",
      durationMs: 1,
      actions: [],
      checks: [],
      mechanical: "pass",
      reviewFlags: [],
      error: null,
      usage: {},
      before: {},
      after: {}
    };
    const report: EvalReport = {
      schemaVersion: 1,
      runId: result.id,
      revision: "test",
      datasetHash: digest("test"),
      promptHash: digest("prompt"),
      provider: "openai",
      model: "test",
      startedAt: "now",
      limits: { repeat: 1, steps: 8, outputTokens: 2048, caseMs: 60000, runMs: 900000, retries: 0 },
      scheduled: 1,
      complete: false,
      results: [result],
      reviews: []
    };
    expect(evalReportStatus(report)).toBe("incomplete");
    report.complete = true;
    expect(evalReportStatus(report)).toBe("review-required");
    const reviewed = reviewEvalResult(report, {
      resultId: result.id,
      truthful: "pass",
      quality: "pass",
      note: "Checked actions and reply"
    });
    expect(evalReportStatus(reviewed)).toBe("pass");
    expect(() =>
      reviewEvalResult(reviewed, {
        resultId: result.id,
        truthful: "fail",
        quality: "fail",
        note: "changed"
      })
    ).toThrow("already reviewed");
    expect(evalReportStatus({ ...reviewed, results: [{ ...result, reply: "changed" }] })).toBe(
      "review-required"
    );
  });
});
