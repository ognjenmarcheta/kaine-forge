import { describe, expect, it } from "vitest";

import { stageSchema } from "./pipeline.contract";

describe("pipeline contract", () => {
  it("parses stage names and rejects unknown ones", () => {
    expect(stageSchema.parse("plan-gate")).toBe("plan-gate");
    expect(stageSchema.safeParse("test").success).toBe(false);
  });
});
