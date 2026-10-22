import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StageProgress } from "./board.progress";
import { CUSTOM_FLOW_SNAPSHOT } from "../test/test.flow";
import { makeState, makeSummary, renderDesk } from "../test/test.render";

const AT = "2026-03-01T10:00:00.000Z";

describe("StageProgress on a flow of the owner's own", () => {
  it("has one segment for each node of the issue's flow and names the stage by its label", () => {
    const summary = makeSummary(
      makeState({
        flowSnapshot: CUSTOM_FLOW_SNAPSHOT,
        stage: "approve",
        status: "waiting",
        history: [
          { at: AT, stage: "intake", event: "intake-started" },
          { at: AT, stage: "setup", event: "stage-started" },
          { at: AT, stage: "plan", event: "stage-started" },
          { at: AT, stage: "plan", event: "plan-ready" }
        ]
      })
    );
    renderDesk(<StageProgress summary={summary} />);

    // The ticket and five steps: six nodes, not the nine of the built-in flow.
    const bar = screen.getByRole("img", {
      name: "Stage 3 of 6: Approve the sketch (Waiting for you)"
    });
    const segments = bar.querySelectorAll(".desk-progress__segment");
    expect(segments).toHaveLength(6);
    expect(segments[2]?.getAttribute("data-current")).toBe("true");
  });

  it("shows the owner's label for a step that reuses a built-in id", () => {
    const summary = makeSummary(
      makeState({
        flowSnapshot: CUSTOM_FLOW_SNAPSHOT,
        stage: "plan",
        status: "running",
        history: [
          { at: AT, stage: "intake", event: "intake-started" },
          { at: AT, stage: "plan", event: "stage-started" }
        ]
      })
    );
    renderDesk(<StageProgress summary={summary} />);
    expect(screen.getByRole("img", { name: "Stage 2 of 6: Sketch (Running)" })).toBeTruthy();
  });
});
