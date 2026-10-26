import { describe, expect, it } from "vitest";

import { ACTIVE_STAGES, HUMAN_GATES, PIPELINE, stageSchema } from "./pipeline.contract";

describe("pipeline contract", () => {
  it("has a node for every active stage and human gate", () => {
    const ids = PIPELINE.nodes.map((node) => node.id).sort();
    expect(ids).toEqual([...ACTIVE_STAGES, ...HUMAN_GATES].sort());
  });

  it("marks the gates as human nodes and nothing else", () => {
    for (const node of PIPELINE.nodes) {
      expect(node.kind === "human").toBe((HUMAN_GATES as readonly string[]).includes(node.id));
    }
  });

  it("parses stage names and rejects unknown ones", () => {
    expect(stageSchema.parse("plan-gate")).toBe("plan-gate");
    expect(stageSchema.safeParse("test").success).toBe(false);
  });
});
