import { describe, expect, it } from "vitest";

import {
  createReplayRunner,
  replayStepFromClaudeStream,
  replayStepFromCodexStream
} from "./agent.replay";
import type { AgentEvent } from "./agent.runner";
import { baseRequest, fixtureLines } from "../testing/agent.testing";

describe("createReplayRunner", () => {
  it("serves steps in order, validates them with the request parser and records requests", async () => {
    const runner = createReplayRunner([
      { structured: { word: "one", overrideSeen: true }, costUsd: 0.5 },
      { structured: { word: "two", overrideSeen: false } }
    ]);
    const first = await runner.run(baseRequest({ prompt: "first" }));
    const second = await runner.run(baseRequest({ prompt: "second" }));
    expect(first).toMatchObject({
      ok: true,
      result: { structured: { word: "one" }, costUsd: 0.5 }
    });
    expect(second).toMatchObject({ ok: true, result: { structured: { word: "two" } } });
    expect(runner.requests.map((request) => request.prompt)).toEqual(["first", "second"]);
    expect(runner.requests[0]).not.toHaveProperty("parse");
    expect(runner.remaining()).toBe(0);
  });

  it("matches a step to the role and provider of the request", async () => {
    const runner = createReplayRunner([
      { role: "reviewer", structured: { word: "review", overrideSeen: true } },
      { role: "planner", provider: "claude", structured: { word: "plan", overrideSeen: true } }
    ]);
    const planner = await runner.run(baseRequest({ role: "planner" }));
    expect(planner).toMatchObject({ ok: true, result: { structured: { word: "plan" } } });
    expect(runner.remaining()).toBe(1);
    const codexPlanner = await runner.run(baseRequest({ role: "planner", provider: "codex" }));
    expect(codexPlanner).toMatchObject({ ok: false, failure: { kind: "process-error" } });
  });

  it("fails like a real runner when the canned output breaks the schema", async () => {
    const runner = createReplayRunner([{ structured: { word: 3 } }]);
    const outcome = await runner.run(baseRequest());
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "schema-mismatch" } });
  });

  it("returns a canned failure with the partial trace", async () => {
    const trace: AgentEvent[] = [{ type: "text", text: "working" }];
    const runner = createReplayRunner([{ failure: { kind: "timeout", timeoutMs: 5 }, trace }]);
    const seen: AgentEvent[] = [];
    const outcome = await runner.run(baseRequest({ onEvent: (event) => seen.push(event) }));
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "timeout" }, partial: { trace } });
    expect(seen).toEqual(trace);
  });

  it("keeps the resumed session id and numbers new sessions", async () => {
    const runner = createReplayRunner([
      { structured: { word: "a", overrideSeen: true } },
      { structured: { word: "b", overrideSeen: true } }
    ]);
    const resumed = await runner.run(baseRequest({ resumeSessionId: "kept" }));
    const fresh = await runner.run(baseRequest());
    expect(resumed.ok && resumed.result.sessionId).toBe("kept");
    expect(fresh.ok && fresh.result.sessionId).toBe("replay-session-1");
  });

  it("reports a step without structured output as no-result", async () => {
    const outcome = await createReplayRunner([{}]).run(baseRequest());
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "no-result" } });
  });
});

describe("steps built from recorded streams", () => {
  it("replays a recorded Claude run with its trace and session", async () => {
    const runner = createReplayRunner([
      replayStepFromClaudeStream(fixtureLines("claude-structured.jsonl"))
    ]);
    const outcome = await runner.run(baseRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.structured).toEqual({ word: "PINEAPPLE-42", overrideSeen: true });
    expect(outcome.result.sessionId).toBe("00000000-0000-4000-8000-000000000001");
    expect(outcome.result.trace.some((event) => event.type === "tool_call")).toBe(true);
    expect(outcome.result.costUsd).toBeGreaterThan(0);
  });

  it("replays a recorded Claude run with denials", async () => {
    const step = replayStepFromClaudeStream(fixtureLines("claude-hook-denied.jsonl"), {
      structured: { word: "x", overrideSeen: false }
    });
    const outcome = await createReplayRunner([step]).run(baseRequest());
    expect(outcome.ok && outcome.result.denials).toHaveLength(1);
  });

  it("replays a recorded Codex run", async () => {
    const step = replayStepFromCodexStream(
      fixtureLines("codex-structured.jsonl").map((line) =>
        line.replaceAll("cwdHasPackageJson", "overrideSeen")
      )
    );
    const outcome = await createReplayRunner([step]).run(baseRequest({ provider: "codex" }));
    expect(outcome.ok && outcome.result.structured).toEqual({
      word: "PINEAPPLE-42",
      overrideSeen: true
    });
  });
});
