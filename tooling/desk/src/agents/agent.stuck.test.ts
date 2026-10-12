import { describe, expect, it } from "vitest";

import type { AgentEvent } from "./agent.runner";
import { createStuckDetector, STUCK_LIMIT } from "./agent.stuck";

let nextId = 0;

/** One call and its result. */
const bash = (command: string, failed: boolean): AgentEvent[] => {
  const id = `call-${(nextId += 1)}`;
  return [
    { type: "tool_call", id, tool: "Bash", command, paths: [] },
    { type: "tool_result", id, isError: failed, exitCode: failed ? 1 : 0, output: "" }
  ];
};

const repeat = (times: number, events: () => AgentEvent[]): AgentEvent[] =>
  Array.from({ length: times }, events).flat();

/** Feeds every event and returns the reasons the detector gave. */
const run = (events: readonly AgentEvent[]): string[] => {
  const detector = createStuckDetector();
  return events.flatMap((event) => {
    const reason = detector.observe(event);
    return reason === null ? [] : [reason];
  });
};

const failing = () => bash("pnpm --filter @repo/api test", true);

describe("createStuckDetector", () => {
  it.each([
    ["the limit of identical failing calls", repeat(STUCK_LIMIT, failing), 1],
    ["one call under the limit", repeat(STUCK_LIMIT - 1, failing), 0],
    [
      "a streak broken by a success of the same call",
      [
        ...repeat(STUCK_LIMIT - 1, failing),
        ...bash("pnpm --filter @repo/api test", false),
        ...repeat(STUCK_LIMIT - 1, failing)
      ],
      0
    ],
    [
      "a streak broken by a different failing call",
      [
        ...repeat(STUCK_LIMIT - 1, failing),
        ...bash("pnpm --filter @repo/api lint", true),
        ...repeat(STUCK_LIMIT - 1, failing)
      ],
      0
    ],
    ["a stream that keeps failing after the stop", repeat(STUCK_LIMIT * 2, failing), 1]
  ])("stops on %s: %d reason(s)", (_name, events, expected) => {
    expect(run(events)).toHaveLength(expected);
  });

  it("counts a failure by exit code when the result is not marked as an error", () => {
    const events = repeat(STUCK_LIMIT, () => {
      const id = `code-${(nextId += 1)}`;
      return [
        { type: "tool_call", id, tool: "Bash", command: "false", paths: [] },
        { type: "tool_result", id, isError: false, exitCode: 2, output: "" }
      ] satisfies AgentEvent[];
    });
    expect(run(events)).toEqual([
      "The agent ran `false` 8 times in a row and it failed each time. The desk stopped the run."
    ]);
  });

  it("ignores calls the permission rules denied", () => {
    const events = repeat(STUCK_LIMIT, () => {
      const id = `denied-${(nextId += 1)}`;
      return [
        { type: "tool_call", id, tool: "Bash", command: "git commit", paths: [] },
        {
          type: "denial",
          denial: { tool: "Bash", toolUseId: id, command: "git commit", paths: [] }
        },
        { type: "tool_result", id, isError: true, output: "denied" }
      ] satisfies AgentEvent[];
    });
    expect(run(events)).toEqual([]);
  });

  it("pairs results with their calls when parallel calls interleave", () => {
    const events = repeat(STUCK_LIMIT, () => {
      const a = `a-${(nextId += 1)}`;
      const b = `b-${(nextId += 1)}`;
      return [
        { type: "tool_call", id: a, tool: "Edit", paths: ["src/a.ts"] },
        { type: "tool_call", id: b, tool: "Edit", paths: ["src/b.ts"] },
        { type: "tool_result", id: b, isError: true, output: "" },
        { type: "tool_result", id: a, isError: false, output: "" }
      ] satisfies AgentEvent[];
    });
    expect(run(events)).toEqual([]);
  });
});
